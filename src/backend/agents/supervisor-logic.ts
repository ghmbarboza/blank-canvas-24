// Supervisor IA, parte pura: o modelo lê trechos recentes e aponta cliente irritado e promessa
// indevida; a regra só confere e dá nome. Travada e IA calada sem dono vêm do SQL (determinístico).
import { checkReply, needsHuman } from "@/backend/support/agent-logic";

export const SUPERVISOR_INTERVAL_MS = 5 * 60_000;
export const SUPERVISOR_MAX_CONVERSATIONS = 12;

export type FlagKind = "stuck" | "angry" | "bad_promise" | "silent_no_owner";

export const FLAG_LABEL: Record<FlagKind, string> = {
  stuck: "Conversa travada",
  angry: "Cliente irritado",
  bad_promise: "Promessa indevida",
  silent_no_owner: "IA calada sem dono",
};

export interface Snippet {
  conversation_id: string;
  messages: { from: "cliente" | "ia" | "atendente"; text: string }[];
}

export const SUPERVISOR_SCHEMA = {
  type: "object",
  properties: {
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          conversation_id: { type: "string" },
          kind: { type: "string", enum: ["angry", "bad_promise", "stuck"] },
          detail: { type: "string", description: "Uma frase para o gestor" },
          evidence: { type: "string", description: "Trecho exato que mostra o problema" },
        },
        required: ["conversation_id", "kind", "detail", "evidence"],
      },
    },
  },
  required: ["flags"],
};

export function supervisorPrompt(snippets: Snippet[]): { system: string; user: string } {
  return {
    system: [
      "Você é o supervisor de uma central de atendimento brasileira. Leia os trechos e aponte só problemas reais:",
      "angry = cliente claramente irritado ou ameaçando reclamar; bad_promise = a IA prometeu prazo, desconto, reembolso ou condição",
      "que não deveria (sem base); stuck = a conversa anda em círculo sem resolver.",
      "Na dúvida, não marque. Responda em português, com o trecho exato como evidência.",
    ].join(" "),
    user: snippets
      .map(
        (s) =>
          `### ${s.conversation_id}\n${s.messages
            .slice(-10)
            .map((m) => `${m.from}: ${m.text.slice(0, 400)}`)
            .join("\n")}`,
      )
      .join("\n\n"),
  };
}

export interface FlagOut {
  conversation_id: string;
  kind: FlagKind;
  detail: string;
  evidence: string;
}

/** Confere o que o modelo apontou: conversa do lote e evidência que aparece mesmo no trecho. */
export function acceptFlags(raw: unknown, snippets: Snippet[]): FlagOut[] {
  const list = ((raw as { flags?: unknown[] } | null)?.flags ?? []) as Record<string, unknown>[];
  const byId = new Map(snippets.map((s) => [s.conversation_id, s]));
  const out: FlagOut[] = [];
  for (const f of list) {
    const s = byId.get(String(f["conversation_id"] ?? ""));
    const kind = String(f["kind"] ?? "");
    if (!s || !["angry", "bad_promise", "stuck"].includes(kind)) continue;
    const evidence = String(f["evidence"] ?? "")
      .trim()
      .slice(0, 1000);
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ");
    const found =
      evidence.length >= 4 &&
      s.messages.some((m) => norm(m.text).includes(norm(evidence).slice(0, 60)));
    if (!found) continue;
    out.push({
      conversation_id: s.conversation_id,
      kind: kind as FlagKind,
      detail: String(f["detail"] ?? FLAG_LABEL[kind as FlagKind]).slice(0, 600),
      evidence,
    });
  }
  return out;
}

/** Sinais óbvios que não precisam do modelo (mesma régua do agente do SAC). */
export function obviousFlags(s: Snippet): FlagOut[] {
  const out: FlagOut[] = [];
  const lastCustomer = [...s.messages].reverse().find((m) => m.from === "cliente");
  if (lastCustomer) {
    const why = needsHuman(lastCustomer.text);
    if (why === "cliente irritado" || why === "menção a reclamação formal")
      out.push({
        conversation_id: s.conversation_id,
        kind: "angry",
        detail:
          why === "cliente irritado" ? "Cliente irritado" : "Cliente falou em reclamação formal",
        evidence: lastCustomer.text.slice(0, 300),
      });
  }
  for (const m of s.messages.filter((x) => x.from === "ia")) {
    const g = checkReply(m.text, []);
    if (g.problems.includes("promessa de prazo")) {
      out.push({
        conversation_id: s.conversation_id,
        kind: "bad_promise",
        detail: "A IA prometeu prazo",
        evidence: m.text.slice(0, 300),
      });
      break;
    }
  }
  return out;
}
