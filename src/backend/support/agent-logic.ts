// Regras puras do agente de IA que responde (sem rede). O LLM compõe; esta trava só confere.
export interface AgentSettings {
  enabled: boolean;
  persona: string;
  tone: string;
  rules: string;
  handoff_message: string;
  debounce_seconds: number;
  max_replies_per_conversation: number;
  business_hours_only: boolean;
  /** Pode marcar reunião pela página de agendamento escolhida (slug). */
  scheduling_enabled: boolean;
  booking_slug: string;
}

export const DEFAULT_AGENT: AgentSettings = {
  enabled: false,
  persona: "Assistente da empresa",
  tone: "cordial, direto e em português do Brasil",
  rules: "",
  handoff_message:
    "Vou chamar alguém da equipe para te ajudar com isso. Já já te respondem por aqui.",
  debounce_seconds: 2,
  max_replies_per_conversation: 12,
  business_hours_only: false,
  scheduling_enabled: false,
  booking_slug: "",
};

export function agentSettings(raw: unknown): AgentSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AgentSettings>;
  return {
    ...DEFAULT_AGENT,
    ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== null)),
  } as AgentSettings;
}

const HANDOFF_PATTERNS = [
  /\b(atendente|humano|pessoa de verdade|falar com algu[eé]m|gerente|supervisor)\b/i,
  /\b(procon|reclame aqui|processo|advogad[oa]|jur[ií]dico)\b/i,
  /\b(cancelar|cancelamento|estorno|reembolso)\b/i,
  /\b(absurdo|rid[ií]culo|p[eé]ssimo|vergonha|palha[cç]ada|lixo)\b/i,
];

// O cliente pediu gente, ameaçou reclamar, quer cancelar ou está irritado: humano assume.
export function needsHuman(text: string): string | null {
  const t = text.normalize("NFC");
  if (HANDOFF_PATTERNS[0]!.test(t)) return "pediu atendimento humano";
  if (HANDOFF_PATTERNS[1]!.test(t)) return "menção a reclamação formal";
  if (HANDOFF_PATTERNS[2]!.test(t)) return "cancelamento ou reembolso";
  if (HANDOFF_PATTERNS[3]!.test(t)) return "cliente irritado";
  if (/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{12,}/.test(t) && /!{2,}/.test(t)) return "cliente irritado";
  return null;
}

// Valores em reais citados no texto (R$ 1.234,56 → 1234.56).
export function moneyValues(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/R\$\s?([\d.]+(?:,\d{1,2})?)/g)) {
    const n = Number(m[1]!.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const PROMISE =
  /\b(garanto|garantimos|com certeza (?:chega|fica pronto)|até amanhã|em \d+ (?:horas?|dias?)|prazo de \d+)\b/i;

export interface GuardResult {
  ok: boolean;
  problems: string[];
}

// Confere a resposta: preço fora do catálogo e promessa de prazo são barrados.
export function checkReply(reply: string, allowedPrices: number[]): GuardResult {
  const problems: string[] = [];
  const allowed = new Set(allowedPrices.map((p) => Math.round(p * 100)));
  for (const v of moneyValues(reply)) {
    if (!allowed.has(Math.round(v * 100)))
      problems.push(`preço fora do catálogo: R$ ${v.toFixed(2)}`);
  }
  if (PROMISE.test(reply)) problems.push("promessa de prazo");
  if (!reply.trim()) problems.push("resposta vazia");
  if (reply.length > 1500) problems.push("resposta longa demais");
  return { ok: problems.length === 0, problems };
}

// Dentro do horário de atendimento da conta? (days ISO 1=seg..7=dom, "HH:MM").
export function withinBusinessHours(
  now: Date,
  tz: string,
  bh: { days?: number[]; start?: string; end?: string; always?: boolean } | null | undefined,
): boolean {
  if (!bh || bh.always) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const iso = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd] ?? 1;
  const hm = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
  const days = bh.days ?? [1, 2, 3, 4, 5];
  return days.includes(iso) && hm >= (bh.start ?? "09:00") && hm < (bh.end ?? "18:00");
}

// Avalia uma resposta da suíte: passou se a decisão (responder/transferir) bate e os fatos esperados aparecem.
export function gradeEval(
  expected: { expected: string | null; must_handoff: boolean },
  got: { handoff: boolean; reply: string },
): { passed: boolean; reason: string } {
  if (expected.must_handoff) {
    return got.handoff
      ? { passed: true, reason: "transferiu como esperado" }
      : { passed: false, reason: "deveria ter transferido para humano" };
  }
  if (got.handoff) return { passed: false, reason: "transferiu sem precisar" };
  const facts = (expected.expected ?? "")
    .split(/[;\n]/)
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  const reply = got.reply.toLowerCase();
  const missing = facts.filter((f) => !reply.includes(f));
  return missing.length === 0
    ? { passed: true, reason: "resposta contém o esperado" }
    : { passed: false, reason: `faltou: ${missing.join(", ")}` };
}
