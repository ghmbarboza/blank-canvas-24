// Parte pura do avaliador: monta a transcrição (já mascarada), descobre quem atendeu e o canal,
// e escreve o pedido para a IA. Sem rede; testado no vitest.
import { maskText } from "@/lib/mask-sensitive";
import type { QualityChannel, QualityCriterion } from "@/features/quality/scoring";

export interface TranscriptMessage {
  direction: string;
  sender_type: string;
  sender_user_id: string | null;
  sender_name?: string | null;
  type: string;
  body: string | null;
  transcript?: string | null;
  is_private: boolean;
  created_at: string;
}

/** Limite de caracteres mandados à IA (custo previsível). Guarda o começo e o fim. */
export const MAX_TRANSCRIPT_CHARS = 18_000;

export function clip(text: string, max = MAX_TRANSCRIPT_CHARS): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${text.slice(0, head)}\n[… trecho do meio omitido …]\n${text.slice(-tail)}`;
}

function speaker(m: TranscriptMessage, names: Map<string, string>): string {
  if (m.direction === "in") return "Cliente";
  if (m.sender_type === "ai") return "Agente de IA";
  if (m.sender_type === "system") return "Sistema";
  const n = m.sender_user_id ? names.get(m.sender_user_id) : undefined;
  return n ? `Atendente (${n})` : "Atendente";
}

/** Uma linha por mensagem pública, na ordem; áudio entra pela transcrição. */
export function conversationTranscript(
  messages: TranscriptMessage[],
  names: Map<string, string> = new Map(),
): string {
  const lines: string[] = [];
  for (const m of [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (m.is_private || m.type === "note") continue;
    const text = (m.body ?? "").trim() || (m.transcript ?? "").trim();
    const content = text || (m.type !== "text" ? `[${m.type}]` : "");
    if (!content) continue;
    lines.push(`${speaker(m, names)}: ${content.replace(/\s+/g, " ")}`);
  }
  return clip(maskText(lines.join("\n")));
}

/** Ligação: transcrição já vem em texto (Atendente/Cliente quando o provedor separa). */
export function callTranscript(text: string | null): string {
  return clip(maskText((text ?? "").trim()));
}

/** Quem atendeu: o humano que mais respondeu; sem humano e com IA, foi a IA. */
export function whoHandled(
  messages: Pick<
    TranscriptMessage,
    "direction" | "sender_type" | "sender_user_id" | "is_private"
  >[],
  fallbackUser: string | null,
): { agentUserId: string | null; isAi: boolean } {
  const counts = new Map<string, number>();
  let ai = 0;
  for (const m of messages) {
    if (m.direction !== "out" || m.is_private) continue;
    if (m.sender_type === "ai") ai++;
    else if (m.sender_type === "user" && m.sender_user_id)
      counts.set(m.sender_user_id, (counts.get(m.sender_user_id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return { agentUserId: top[0], isAi: false };
  if (ai > 0) return { agentUserId: null, isAi: true };
  return { agentUserId: fallbackUser, isAi: false };
}

export function channelFromPlatform(platform: string | null | undefined): QualityChannel {
  return platform === "email" ? "email" : "chat";
}

export const EVALUATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion_id: { type: "string" },
          score: { type: "number", description: "0 a 100" },
          passed: { type: "boolean" },
          evidence: {
            type: "string",
            description:
              "Trecho copiado LITERALMENTE da transcrição que prova a nota. Vazio se não houver.",
          },
          comment: { type: "string", description: "Uma frase curta explicando a nota" },
        },
        required: ["criterion_id", "score", "passed", "evidence", "comment"],
      },
    },
    summary: { type: "string", description: "Duas frases: o que foi bem e o que melhorar" },
  },
  required: ["items", "summary"],
};

export function evaluationPrompt(input: {
  criteria: QualityCriterion[];
  channel: QualityChannel;
  isAi: boolean;
  formName: string;
  company: string;
}): string {
  const who = input.isAi ? "um agente de IA" : "um atendente humano";
  const canal = { call: "ligação", chat: "conversa por mensagem", email: "troca de e-mails" }[
    input.channel
  ];
  const list = input.criteria
    .map(
      (c) =>
        `- id "${c.id}" · ${c.label}${c.eliminatory ? " [ELIMINATÓRIO: passed=false só com prova clara]" : ` · peso ${c.weight}`}${c.description ? ` · ${c.description}` : ""}`,
    )
    .join("\n");
  return [
    `Você é o avaliador de qualidade da empresa ${input.company}. Avalie uma ${canal} atendida por ${who},`,
    `usando o formulário "${input.formName}". Seja justo e concreto, como um supervisor experiente.`,
    "",
    "Critérios:",
    list,
    "",
    "Regras:",
    "- Dê nota de 0 a 100 para cada critério e diga se passou (passed).",
    "- evidence é um trecho copiado LITERALMENTE da transcrição. Não parafraseie. Sem trecho, deixe vazio.",
    "- Critério que não se aplica a esta interação: nota 100, passed true, comment explicando.",
    "- Dados como [CPF oculto] foram mascarados de propósito; não penalize por isso.",
    "- Responda em português do Brasil.",
  ].join("\n");
}
