// Núcleo puro da qualidade: critérios do formulário, nota ponderada com item eliminatório,
// concordância da calibração e modelos prontos. Usado no servidor (avaliador) e na tela.

import { EDITION, hasChannel, type Edition, type EditionChannel } from "@/lib/edition";

export type QualityChannel = "call" | "chat" | "email";

export interface QualityCriterion {
  id: string;
  label: string;
  description: string;
  weight: number;
  eliminatory: boolean;
}

export interface EvaluationItem {
  criterion_id: string;
  label: string;
  weight: number;
  eliminatory: boolean;
  score: number;
  passed: boolean;
  evidence: string;
  evidence_verified: boolean;
  comment: string;
}

export const CHANNEL_LABEL: Record<QualityChannel, string> = {
  call: "Ligação",
  chat: "Chat e redes",
  email: "E-mail",
};

const QUALITY_CHANNEL_EDITION: Partial<Record<QualityChannel, EditionChannel>> = {
  call: "phone",
  email: "email",
};

/** Canais de qualidade que a edição oferece nos filtros e no formulário. */
export function qualityChannelsFor(edition: Edition = EDITION): QualityChannel[] {
  return (["call", "chat", "email"] as QualityChannel[]).filter((c) => {
    const needs = QUALITY_CHANNEL_EDITION[c];
    return !needs || hasChannel(needs, edition);
  });
}

/** Nota mínima para um critério contar como "cumprido". */
export const PASS_MARK = 70;
/** Diferença máxima (em pontos) para a nota do gestor e a da IA concordarem num critério. */
export const AGREEMENT_TOLERANCE = 15;

const MAX_CRITERIA = 20;

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "criterio"
  );
}

/** Valida e normaliza a lista vinda da tela ou do banco. Lança erro com mensagem para leigo. */
export function normalizeCriteria(raw: unknown): QualityCriterion[] {
  if (!Array.isArray(raw)) throw new Error("A lista de critérios veio num formato inválido");
  const seen = new Set<string>();
  const out: QualityCriterion[] = [];
  for (const r of raw.slice(0, MAX_CRITERIA)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const label = String(o["label"] ?? "")
      .trim()
      .slice(0, 120);
    if (!label) continue;
    let id = String(o["id"] ?? "").trim() || slug(label);
    id = slug(id);
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    const w = Number(o["weight"]);
    out.push({
      id,
      label,
      description: String(o["description"] ?? "")
        .trim()
        .slice(0, 500),
      weight: Number.isFinite(w) ? Math.min(10, Math.max(1, Math.round(w))) : 1,
      eliminatory: Boolean(o["eliminatory"]),
    });
  }
  if (out.length === 0) throw new Error("Cadastre pelo menos um critério com nome");
  return out;
}

function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * Nota final de 0 a 100: média ponderada dos critérios. Um item eliminatório reprovado
 * (ex.: prometeu o que não pode, expôs dado sensível) zera a nota.
 */
export function computeScore(
  items: Pick<EvaluationItem, "score" | "weight" | "eliminatory" | "passed">[],
): {
  score: number;
  eliminated: boolean;
} {
  if (items.length === 0) return { score: 0, eliminated: false };
  const eliminated = items.some((i) => i.eliminatory && !i.passed);
  if (eliminated) return { score: 0, eliminated: true };
  const scored = items.filter((i) => !i.eliminatory);
  if (scored.length === 0) return { score: 100, eliminated: false };
  const totalWeight = scored.reduce((s, i) => s + i.weight, 0);
  const sum = scored.reduce((s, i) => s + clampScore(i.score) * i.weight, 0);
  return { score: Math.round((sum / totalWeight) * 10) / 10, eliminated: false };
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9[\]]+/g, " ")
    .trim();
}

/** O trecho citado pela IA existe na transcrição? (ignora acento, caixa e pontuação). */
export function evidenceFound(evidence: string, transcript: string): boolean {
  const e = norm(evidence);
  if (e.length < 4) return false;
  const t = norm(transcript);
  if (t.includes(e)) return true;
  // Citação levemente editada: aceita se 80% das palavras (em ordem) aparecem.
  const words = e.split(" ").filter((w) => w.length > 2);
  if (words.length < 3) return false;
  let pos = 0;
  let hits = 0;
  for (const w of words) {
    const at = t.indexOf(w, pos);
    if (at >= 0) {
      hits++;
      pos = at + w.length;
    }
  }
  return hits / words.length >= 0.8;
}

interface RawAiItem {
  criterion_id?: unknown;
  score?: unknown;
  passed?: unknown;
  evidence?: unknown;
  comment?: unknown;
}

/**
 * Junta a resposta da IA aos critérios do formulário. Critério que a IA esqueceu vira
 * "sem evidência" (nota 0, reprovado para não passar despercebido). Evidência que não está
 * na transcrição é descartada: a nota só vale com o trecho como prova.
 */
export function mergeAiItems(
  criteria: QualityCriterion[],
  raw: unknown,
  transcript: string,
): EvaluationItem[] {
  const list = (Array.isArray(raw) ? raw : []) as RawAiItem[];
  const byId = new Map(list.map((r) => [String(r.criterion_id ?? ""), r]));
  return criteria.map((c) => {
    const r = byId.get(c.id);
    if (!r) {
      return {
        criterion_id: c.id,
        label: c.label,
        weight: c.weight,
        eliminatory: c.eliminatory,
        score: c.eliminatory ? 100 : 0,
        passed: c.eliminatory,
        evidence: "",
        evidence_verified: false,
        comment: "A IA não avaliou este critério",
      };
    }
    const evidence = String(r.evidence ?? "")
      .trim()
      .slice(0, 600);
    const verified = evidence ? evidenceFound(evidence, transcript) : false;
    const score = clampScore(r.score);
    const passed = c.eliminatory
      ? // Eliminatório só reprova com prova: sem trecho verificado, a dúvida favorece o atendente.
        r.passed === false && verified
        ? false
        : true
      : typeof r.passed === "boolean"
        ? r.passed
        : score >= PASS_MARK;
    return {
      criterion_id: c.id,
      label: c.label,
      weight: c.weight,
      eliminatory: c.eliminatory,
      score: c.eliminatory ? (passed ? 100 : 0) : score,
      passed,
      evidence: verified ? evidence : "",
      evidence_verified: verified,
      comment: String(r.comment ?? "")
        .trim()
        .slice(0, 400),
    };
  });
}

/** Percentual de critérios em que o gestor e a IA concordam (nota a até 15 pontos e mesmo veredito). */
export function agreement(
  ai: Pick<EvaluationItem, "criterion_id" | "score" | "passed">[],
  manager: Pick<EvaluationItem, "criterion_id" | "score" | "passed">[],
): number {
  const byId = new Map(ai.map((i) => [i.criterion_id, i]));
  let compared = 0;
  let agreed = 0;
  for (const m of manager) {
    const a = byId.get(m.criterion_id);
    if (!a) continue;
    compared++;
    if (a.passed === m.passed && Math.abs(a.score - m.score) <= AGREEMENT_TOLERANCE) agreed++;
  }
  return compared === 0 ? 0 : Math.round((agreed / compared) * 1000) / 10;
}

export interface QualityTemplate {
  key: string;
  name: string;
  description: string;
  channels: QualityChannel[];
  criteria: QualityCriterion[];
}

const c = (
  id: string,
  label: string,
  description: string,
  weight: number,
  eliminatory = false,
): QualityCriterion => ({ id, label, description, weight, eliminatory });

/** Modelos prontos oferecidos no assistente e na tela de formulários. */
export const QUALITY_TEMPLATES: QualityTemplate[] = [
  {
    key: "atendimento",
    name: "Atendimento ao cliente",
    description: "Para SAC, suporte e pós-venda, por qualquer canal.",
    channels: ["call", "chat", "email"],
    criteria: [
      c(
        "saudacao",
        "Cumprimentou e se apresentou",
        "Abriu a conversa com cordialidade e disse quem é.",
        1,
      ),
      c("entendeu", "Entendeu o problema", "Fez perguntas para entender antes de responder.", 3),
      c(
        "resolveu",
        "Resolveu ou deu prazo claro",
        "Resolveu, ou disse o próximo passo e quando.",
        4,
      ),
      c("tom", "Tom cordial e claro", "Linguagem simples, sem jargão, sem ser ríspido.", 2),
      c(
        "fechamento",
        "Confirmou se ficou tudo certo",
        "Perguntou se o cliente precisa de mais algo.",
        1,
      ),
      c(
        "promessa",
        "Não prometeu o que não pode",
        "Não garantiu prazo, desconto ou resultado fora da política.",
        1,
        true,
      ),
      c(
        "dado_sensivel",
        "Não pediu nem expôs dado sensível",
        "Não pediu senha nem repetiu CPF ou cartão completos.",
        1,
        true,
      ),
    ],
  },
  {
    key: "vendas",
    name: "Vendas e pré-venda",
    description: "Para SDR e vendedores: qualificação, valor e próximo passo.",
    channels: ["call", "chat", "email"],
    criteria: [
      c("rapport", "Criou conexão", "Usou o nome do cliente e mostrou interesse real.", 1),
      c(
        "descoberta",
        "Descobriu a necessidade",
        "Perguntou sobre dor, prazo, orçamento e quem decide.",
        4,
      ),
      c(
        "valor",
        "Mostrou valor ligado à dor",
        "Explicou o benefício pensando no caso do cliente.",
        3,
      ),
      c("objecoes", "Tratou as objeções", "Respondeu dúvidas e objeções sem pressionar.", 2),
      c(
        "proximo_passo",
        "Combinou o próximo passo",
        "Saiu com reunião, proposta ou data marcada.",
        3,
      ),
      c(
        "promessa",
        "Não prometeu o que não pode",
        "Não garantiu desconto, prazo ou resultado fora da política.",
        1,
        true,
      ),
    ],
  },
  {
    key: "agente_ia",
    name: "Agente de IA",
    description: "Para conferir as conversas atendidas pelos agentes de IA.",
    channels: ["call", "chat", "email"],
    criteria: [
      c(
        "respondeu_certo",
        "Respondeu o que foi perguntado",
        "Resposta correta e direta à pergunta do cliente.",
        4,
      ),
      c(
        "natural",
        "Conversa natural",
        "Sem repetir saudação, sem parecer roteiro, frases curtas.",
        2,
      ),
      c(
        "passou_humano",
        "Passou para humano na hora certa",
        "Quando não sabia ou o cliente pediu, passou com resumo.",
        3,
      ),
      c(
        "inventou",
        "Não inventou informação",
        "Não deu preço, prazo ou política que não estão na base.",
        1,
        true,
      ),
      c(
        "dado_sensivel",
        "Não pediu nem expôs dado sensível",
        "Não pediu senha nem repetiu CPF ou cartão completos.",
        1,
        true,
      ),
    ],
  },
];
