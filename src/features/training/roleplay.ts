// Treino com roleplay: lógica pura (prompts, checklist e nota), usada pelo servidor e pela tela.
import { INITIAL_STATE, processUtterance, type CoachState } from "@/features/coach/engine";
import type { PlaybookContent, ScorecardCriterion } from "@/features/playbooks/types";

export type Difficulty = "easy" | "medium" | "hard";

export interface RoleplayMessage {
  role: "seller" | "persona";
  text: string;
  at: string;
}

export interface PersonaInput {
  name: string;
  role: string | null;
  company: string | null;
  profile: string;
  objections: string[];
  difficulty: Difficulty;
}

export interface CriterionScore {
  id: string;
  label: string;
  score: number; // 0–10
  quote: string;
  comment: string;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
};

const DIFFICULTY_RULE: Record<Difficulty, string> = {
  easy: "Você é receptivo: levanta no máximo uma objeção leve e aceita bons argumentos.",
  medium:
    "Você é cauteloso: levanta as objeções do seu perfil, pede números e só avança quando o vendedor faz boas perguntas sobre o seu problema.",
  hard: "Você é cético e ocupado: interrompe respostas longas, compara com concorrentes, questiona preço e só aceita um próximo passo se o vendedor qualificar dor, orçamento, quem decide e prazo.",
};

// Personas prontas para começar a treinar (botão "Criar exemplos").
export const SAMPLE_PERSONAS: PersonaInput[] = [
  {
    name: "Mariana Costa",
    role: "Diretora de operações",
    company: "Acme Logística (120 pessoas)",
    profile:
      "Perde pedidos porque a equipe responde clientes no WhatsApp pessoal. Já testou um CRM e a equipe não usou. Decide junto com o sócio financeiro.",
    objections: [
      "Já tentamos um CRM e ninguém usou",
      "Está caro para este trimestre",
      "Preciso falar com meu sócio",
    ],
    difficulty: "medium",
  },
  {
    name: "Ricardo Alves",
    role: "Dono",
    company: "Alves Imóveis (8 corretores)",
    profile:
      "Recebe leads de portais e anúncios, mas não sabe quantos viram visita. Quer algo simples, sem implantação longa.",
    objections: ["Não tenho tempo para implantar sistema", "Meus corretores não vão usar"],
    difficulty: "easy",
  },
  {
    name: "Fernanda Lima",
    role: "Gerente comercial",
    company: "TechSul Distribuidora (40 vendedores)",
    profile:
      "Usa RD Station há 3 anos, acha caro mas tem medo de migrar. Exige integração com o ERP e relatórios de previsão por vendedor.",
    objections: [
      "Já usamos RD Station",
      "Migrar dá muito trabalho",
      "Vocês integram com o nosso ERP?",
      "Preciso de desconto",
    ],
    difficulty: "hard",
  },
];

export function personaSystemPrompt(p: PersonaInput, pb: PlaybookContent | null): string {
  const objections = [...p.objections, ...(pb?.objections ?? []).map((o) => o.label)].slice(0, 8);
  return [
    "Você interpreta um CLIENTE em um treino de vendas, em português do Brasil. Nunca saia do papel, nunca diga que é uma IA e nunca dê dicas ao vendedor.",
    `Quem você é: ${p.name}${p.role ? `, ${p.role}` : ""}${p.company ? `, da ${p.company}` : ""}.`,
    p.profile ? `Contexto: ${p.profile}` : "",
    objections.length
      ? `Objeções que você costuma trazer (use quando fizer sentido, uma de cada vez): ${objections.join("; ")}.`
      : "",
    `Dificuldade: ${DIFFICULTY_RULE[p.difficulty]}`,
    "Responda como numa conversa real: de 1 a 3 frases curtas, sem listas. Se o vendedor fizer uma pergunta boa, dê informação útil sobre o seu negócio (números plausíveis). Se ele só apresentar o produto sem perguntar, mostre desinteresse.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function openingLine(p: PersonaInput): string {
  const first = p.name.split(" ")[0];
  return p.difficulty === "hard"
    ? `Oi, é ${first}. Tenho uns 15 minutos, então vamos direto ao ponto: por que eu deveria mudar o que já uso?`
    : `Oi, aqui é ${first}${p.company ? ` da ${p.company.split(" (")[0]}` : ""}. Vi que vocês queriam conversar. Pode falar.`;
}

export function toLlmMessages(messages: RoleplayMessage[]) {
  // Para o modelo, ele é o cliente (assistant) e o vendedor é o usuário.
  return messages.map((m) => ({
    role: m.role === "seller" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));
}

/** Roda o motor do coach sobre as falas para saber o que do roteiro o vendedor já cobriu. */
export function coveredFromMessages(pb: PlaybookContent, messages: RoleplayMessage[]): CoachState {
  let state = INITIAL_STATE;
  let t = 0;
  for (const m of messages) {
    const dur = Math.max(1500, m.text.length * 60);
    state = processUtterance(state, pb, {
      text: m.text,
      isSeller: m.role === "seller",
      startMs: t,
      endMs: t + dur,
    }).state;
    t += dur;
  }
  return state;
}

/** Nota geral 0–100 a partir dos critérios (0–10) ponderados pela rubrica. */
export function weightedScore(scores: CriterionScore[], criteria: ScorecardCriterion[]): number {
  if (scores.length === 0) return 0;
  let total = 0;
  let weights = 0;
  for (const s of scores) {
    const w = criteria.find((c) => c.id === s.id)?.weight ?? 1;
    total += Math.max(0, Math.min(10, s.score)) * w;
    weights += w;
  }
  return weights === 0 ? 0 : Math.round((total / weights) * 10);
}

export function evaluationPrompt(
  criteria: ScorecardCriterion[],
  pb: PlaybookContent | null,
  messages: RoleplayMessage[],
): { system: string; user: string } {
  const system =
    "Você avalia um treino de vendas em português do Brasil. Dê nota de 0 a 10 para cada critério da rubrica, sempre com uma citação LITERAL de uma fala do vendedor que justifique (ou string vazia se ele não fez), e um comentário curto. Depois liste exatamente 3 pontos fortes e 3 pontos a melhorar, concretos e acionáveis, e um parágrafo de feedback. Seja justo e exigente: não dê nota alta para o que não aconteceu.";
  const required = pb
    ? pb.phases.flatMap((p) => p.items.filter((i) => i.required).map((i) => i.label)).join("; ")
    : "";
  const user = [
    `Rubrica:\n${criteria.map((c) => `- ${c.id}: ${c.label}${c.description ? ` (${c.description})` : ""}`).join("\n")}`,
    pb ? `Playbook: ${pb.name} (${pb.framework}). Itens obrigatórios: ${required}.` : "",
    `Conversa:\n${messages.map((m) => `${m.role === "seller" ? "VENDEDOR" : "CLIENTE"}: ${m.text}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}

export const REPLY_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
};

export const EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "number" },
          quote: { type: "string" },
          comment: { type: "string" },
        },
        required: ["id", "score", "quote", "comment"],
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    feedback: { type: "string" },
  },
  required: ["criteria", "strengths", "improvements", "feedback"],
};

export interface RawEvaluation {
  criteria?: { id?: string; score?: number; quote?: string; comment?: string }[];
  strengths?: string[];
  improvements?: string[];
  feedback?: string;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/["“”?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza a avaliação da IA: só critérios da rubrica, notas no intervalo, citação que existe. */
export function sanitizeEvaluation(
  raw: RawEvaluation,
  criteria: ScorecardCriterion[],
  messages: RoleplayMessage[],
) {
  const sellerText = fold(
    messages
      .filter((m) => m.role === "seller")
      .map((m) => m.text)
      .join(" \n "),
  );
  const scores: CriterionScore[] = criteria.map((c) => {
    const r = (raw.criteria ?? []).find((x) => x.id === c.id);
    const quote = (r?.quote ?? "").trim();
    const n = Number(r?.score);
    return {
      id: c.id,
      label: c.label,
      score: Math.max(0, Math.min(10, Number.isFinite(n) ? n : 0)),
      // citação inventada (que o vendedor não disse) é descartada
      quote: quote && sellerText.includes(fold(quote)) ? quote : "",
      comment: (r?.comment ?? "").trim(),
    };
  });
  const three = (a: string[] | undefined) =>
    (a ?? [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 3);
  return {
    scores,
    score: weightedScore(scores, criteria),
    strengths: three(raw.strengths),
    improvements: three(raw.improvements),
    feedback: (raw.feedback ?? "").trim(),
  };
}

/** Destaca o termo buscado num trecho (sem acento e sem caixa) para a biblioteca. */
export function highlightParts(text: string, term: string): { text: string; hit: boolean }[] {
  const q = term.trim();
  if (q.length < 2) return [{ text, hit: false }];
  const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hay = strip(text);
  const needle = strip(q);
  const parts: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const j = hay.indexOf(needle, i);
    if (j < 0) {
      parts.push({ text: text.slice(i), hit: false });
      break;
    }
    if (j > i) parts.push({ text: text.slice(i, j), hit: false });
    parts.push({ text: text.slice(j, j + needle.length), hit: true });
    i = j + needle.length;
  }
  return parts;
}
