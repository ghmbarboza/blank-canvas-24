// Motor do livecoach: puro (sem rede), roda no worker a cada frase transcrita e é testado no vitest.
// Camada 1 = gatilhos por palavra (< 1 s). Camada 2 = LLM, montada por buildCoachPrompt.
import type { PlaybookContent } from "@/features/playbooks/types";

export type TipKind =
  "checklist" | "objection" | "battlecard" | "closing" | "compliance" | "pace" | "question";

export interface CoachTip {
  key: string; // dedupe: kind:id
  kind: TipKind;
  title: string;
  body: string;
  playbook_item?: string;
}

export interface Utterance {
  text: string;
  isSeller: boolean;
  startMs: number;
  endMs: number;
}

export interface CoachState {
  covered: string[]; // ids de itens do checklist já feitos
  fired: Record<string, number>; // key → último ms em que a dica saiu
  sellerMs: number;
  buyerMs: number;
  sellerStreakStartMs: number | null;
  lastMs: number;
}

export const INITIAL_STATE: CoachState = {
  covered: [],
  fired: {},
  sellerMs: 0,
  buyerMs: 0,
  sellerStreakStartMs: null,
  lastMs: 0,
};

const COOLDOWN_MS = 2 * 60_000;
const PACE_COOLDOWN_MS = 5 * 60_000;
const MONOLOGUE_MS = 90_000;
const PACE_MIN_TOTAL_MS = 3 * 60_000;
const PACE_MAX_SELLER_RATIO = 0.65;
const NUDGE_AFTER_MS = 8 * 60_000;

export function normalize(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%$ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Algum gatilho aparece como palavra/frase inteira no texto? */
export function matches(text: string, triggers: string[]): string | null {
  const t = normalize(text);
  for (const trig of triggers) {
    const n = normalize(trig);
    if (n.trim() && t.includes(n)) return trig;
  }
  return null;
}

function canFire(state: CoachState, key: string, now: number, cooldown = COOLDOWN_MS): boolean {
  const last = state.fired[key];
  return last === undefined || now - last >= cooldown;
}

/** Processa uma frase final e devolve o novo estado e as dicas que devem sair agora. */
export function processUtterance(
  state: CoachState,
  pb: PlaybookContent,
  u: Utterance,
): { state: CoachState; tips: CoachTip[] } {
  const tips: CoachTip[] = [];
  const fired = { ...state.fired };
  const covered = new Set(state.covered);
  const now = u.endMs;
  const dur = Math.max(0, u.endMs - u.startMs);
  let { sellerMs, buyerMs, sellerStreakStartMs } = state;
  const push = (tip: CoachTip, cooldown = COOLDOWN_MS) => {
    if (canFire({ ...state, fired }, tip.key, now, cooldown)) {
      tips.push(tip);
      fired[tip.key] = now;
    }
  };

  if (u.isSeller) {
    sellerMs += dur;
    sellerStreakStartMs = sellerStreakStartMs ?? u.startMs;
    for (const ph of pb.phases)
      for (const it of ph.items)
        if (!covered.has(it.id) && matches(u.text, it.keywords)) covered.add(it.id);
    const bad = matches(u.text, pb.forbidden_phrases);
    if (bad)
      push({
        key: `compliance:${normalize(bad).trim()}`,
        kind: "compliance",
        title: "Cuidado com a promessa",
        body: `Você disse "${bad}". Evite garantir resultado; fale do que já aconteceu com clientes parecidos.`,
      });
    if (sellerStreakStartMs !== null && now - sellerStreakStartMs >= MONOLOGUE_MS)
      push(
        {
          key: "pace:monologue",
          kind: "pace",
          title: "Faça uma pergunta",
          body: "Você está falando há mais de 1 minuto e meio sem pausa. Devolva a palavra ao cliente.",
        },
        PACE_COOLDOWN_MS,
      );
  } else {
    buyerMs += dur;
    sellerStreakStartMs = null;
    for (const o of pb.objections) {
      if (matches(u.text, o.triggers))
        push({
          key: `objection:${o.id}`,
          kind: "objection",
          title: `Objeção: ${o.label}`,
          body: o.proof ? `${o.answer}\n\nProva: ${o.proof}` : o.answer,
          playbook_item: o.id,
        });
    }
    for (const c of pb.competitors) {
      if (matches(u.text, c.triggers))
        push({
          key: `battlecard:${c.id}`,
          kind: "battlecard",
          title: `Concorrente citado: ${c.name}`,
          body: c.arguments.map((a) => `• ${a}`).join("\n"),
          playbook_item: c.id,
        });
    }
    for (const s of pb.closing_signals) {
      if (matches(u.text, s.triggers))
        push({
          key: `closing:${s.id}`,
          kind: "closing",
          title: `Sinal de compra: ${s.label}`,
          body: s.proposal,
          playbook_item: s.id,
        });
    }
  }

  const total = sellerMs + buyerMs;
  if (total >= PACE_MIN_TOTAL_MS && sellerMs / total > PACE_MAX_SELLER_RATIO)
    push(
      {
        key: "pace:ratio",
        kind: "pace",
        title: "Deixe o cliente falar mais",
        body: `Você está com ${Math.round((sellerMs / total) * 100)}% da fala. O ideal fica abaixo de 60%.`,
      },
      PACE_COOLDOWN_MS,
    );

  const next: CoachState = {
    covered: [...covered],
    fired,
    sellerMs,
    buyerMs,
    sellerStreakStartMs,
    lastMs: Math.max(state.lastMs, now),
  };
  const nudge = checklistNudge(next, pb, now);
  if (nudge && canFire(next, nudge.key, now, COOLDOWN_MS * 2)) {
    tips.push(nudge);
    next.fired = { ...next.fired, [nudge.key]: now };
  }
  return { state: next, tips };
}

/** Itens obrigatórios que ainda não aconteceram, na ordem do roteiro. */
export function pendingItems(state: CoachState, pb: PlaybookContent) {
  const covered = new Set(state.covered);
  return pb.phases.flatMap((ph) =>
    ph.items
      .filter((it) => it.required && !covered.has(it.id))
      .map((it) => ({ ...it, phase: ph.name })),
  );
}

/** Progresso do checklist (0–1) contando só os obrigatórios. */
export function progress(state: CoachState, pb: PlaybookContent): number {
  const req = pb.phases.flatMap((p) => p.items.filter((i) => i.required));
  if (req.length === 0) return 1;
  const covered = new Set(state.covered);
  return req.filter((i) => covered.has(i.id)).length / req.length;
}

/** Depois de alguns minutos, lembra o próximo item obrigatório que ainda falta. */
export function checklistNudge(
  state: CoachState,
  pb: PlaybookContent,
  now: number,
): CoachTip | null {
  if (now < NUDGE_AFTER_MS) return null;
  const next = pendingItems(state, pb)[0];
  if (!next) return null;
  const q = pb.questions.find((qq) =>
    normalize(qq.label).includes(normalize(next.label).trim().split(" ")[0] ?? ""),
  );
  return {
    key: `checklist:${next.id}`,
    kind: "checklist",
    title: `Falta: ${next.label}`,
    body: q
      ? `Sugestão de pergunta: "${q.label}"`
      : `Fase "${next.phase}" do roteiro ainda não cobriu este ponto.`,
    playbook_item: next.id,
  };
}

/** Prompt da camada LLM: trecho recente + o que falta, pedindo no máximo 2 dicas curtas. */
export function buildCoachPrompt(
  pb: PlaybookContent,
  recent: { speaker: "vendedor" | "cliente"; text: string }[],
  state: CoachState,
): { system: string; user: string } {
  const pending =
    pendingItems(state, pb)
      .map((p) => `- ${p.label}`)
      .join("\n") || "- nada obrigatório pendente";
  const system =
    "Você é um coach de vendas ao vivo, em português do Brasil. Lê o trecho mais recente de uma reunião e devolve no máximo 2 dicas curtas e acionáveis para o VENDEDOR, seguindo o playbook. Nunca invente preço, prazo ou promessa. Se nada for útil agora, devolva lista vazia.";
  const user = [
    `Playbook: ${pb.name} (${pb.framework}).`,
    `Itens obrigatórios ainda não cobertos:\n${pending}`,
    pb.objections.length
      ? `Objeções mapeadas: ${pb.objections.map((o) => o.label).join("; ")}`
      : "",
    pb.forbidden_phrases.length ? `Frases proibidas: ${pb.forbidden_phrases.join("; ")}` : "",
    `Trecho recente:\n${recent
      .slice(-12)
      .map((r) => `${r.speaker}: ${r.text}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}

export const COACH_TIPS_SCHEMA = {
  type: "object",
  properties: {
    tips: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "checklist",
              "objection",
              "battlecard",
              "closing",
              "compliance",
              "pace",
              "question",
            ],
          },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["kind", "title", "body"],
      },
    },
  },
  required: ["tips"],
} as const;
