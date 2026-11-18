// Briefing antes da reunião: monta o contexto que a IA recebe e define o formato da resposta. Puro.

export interface BriefingInput {
  title: string;
  when: string;
  contact: {
    name: string | null;
    company: string | null;
    job_title: string | null;
    lifecycle: string | null;
    score: number | null;
    ai_summary: string | null;
    ai_next_step: string | null;
    notes: string | null;
  } | null;
  deal: { title: string; value: number | null; stage: string | null; status: string } | null;
  answers: Record<string, unknown>;
  messages: { direction: string; body: string; at: string }[];
  previous: { title: string; at: string | null; summary: string; next_steps: string[] } | null;
  playbook: { name: string; questions: string[]; objections: string[] };
}

export interface Briefing {
  summary: string;
  goal: string;
  talking_points: string[];
  questions: string[];
  watch_out: string[];
}

export const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Quem é e em que pé está, em até 4 linhas" },
    goal: { type: "string", description: "O objetivo desta reunião numa frase" },
    talking_points: { type: "array", items: { type: "string" }, description: "Até 5 pontos" },
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Até 5 perguntas para fazer, priorizando o que ainda falta saber",
    },
    watch_out: {
      type: "array",
      items: { type: "string" },
      description: "Objeções ou riscos prováveis (até 4)",
    },
  },
  required: ["summary", "goal", "talking_points", "questions", "watch_out"],
} as const;

export const BRIEFING_SYSTEM =
  "Você prepara o vendedor para uma reunião que começa em 30 minutos. Português do Brasil, frases curtas e práticas. Use só o que está no contexto: não invente números, nomes, prazos nem acordos. Se faltar informação, diga o que perguntar.";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function briefingPrompt(i: BriefingInput): string {
  const parts: string[] = [`Reunião: ${i.title} (${i.when})`];
  if (i.contact) {
    const c = i.contact;
    parts.push(
      [
        `Contato: ${c.name ?? "sem nome"}${c.job_title ? `, ${c.job_title}` : ""}${c.company ? ` na ${c.company}` : ""}`,
        c.lifecycle ? `Fase: ${c.lifecycle}` : "",
        c.score != null ? `Nota do lead: ${c.score}` : "",
        c.ai_summary ? `Resumo do CRM: ${clip(c.ai_summary, 600)}` : "",
        c.ai_next_step ? `Próximo passo anotado: ${clip(c.ai_next_step, 300)}` : "",
        c.notes ? `Observações: ${clip(c.notes, 600)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } else parts.push("Contato: não vinculado.");
  if (i.deal)
    parts.push(
      `Negócio: ${i.deal.title} · etapa ${i.deal.stage ?? "?"} · ${i.deal.status}${i.deal.value ? ` · R$ ${Number(i.deal.value).toFixed(2).replace(".", ",")}` : ""}`,
    );
  const answers = Object.entries(i.answers ?? {}).filter(([, v]) => String(v ?? "").trim());
  if (answers.length)
    parts.push(
      `Respostas no agendamento:\n${answers.map(([k, v]) => `- ${k}: ${clip(String(v), 300)}`).join("\n")}`,
    );
  if (i.previous)
    parts.push(
      `Reunião anterior (${i.previous.title}${i.previous.at ? `, ${i.previous.at}` : ""}):\n${clip(i.previous.summary, 900)}${i.previous.next_steps.length ? `\nPróximos passos combinados: ${i.previous.next_steps.join("; ")}` : ""}`,
    );
  if (i.messages.length)
    parts.push(
      `Últimas mensagens (mais antiga primeiro):\n${i.messages
        .map((m) => `${m.direction === "in" ? "CLIENTE" : "EMPRESA"}: ${clip(m.body, 300)}`)
        .join("\n")}`,
    );
  else parts.push("Sem mensagens trocadas ainda.");
  parts.push(
    `Playbook "${i.playbook.name}". Perguntas de qualificação: ${i.playbook.questions.slice(0, 8).join("; ") || "nenhuma"}. Objeções comuns: ${i.playbook.objections.slice(0, 6).join("; ") || "nenhuma"}.`,
  );
  return parts.join("\n\n").slice(0, 14_000);
}

/** Limpa a saída do modelo: listas curtas, sem itens vazios. */
export function normalizeBriefing(
  b: { [K in keyof Briefing]?: unknown } | null | undefined,
): Briefing {
  const list = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, max);
  return {
    summary: String(b?.summary ?? "").trim(),
    goal: String(b?.goal ?? "").trim(),
    talking_points: list(b?.talking_points, 5),
    questions: list(b?.questions, 5),
    watch_out: list(b?.watch_out, 4),
  };
}
