// Regras puras do call center (navegador e servidor): ordem da fila, capacidade, estado do
// atendente, regras de discagem, escolha de fila pela fala e leitura da lista do Não Me Perturbe.
// A ordem e a capacidade espelham as funções do banco (claim_next_work_item / cc_fits): o banco
// decide de verdade; aqui servem para a tela explicar e para os testes fixarem o contrato.

import { EDITION, hasChannel, hasPlatform, type Edition } from "@/lib/edition";

export type CapacityClass = "voice" | "chat" | "email" | "task";
export type WorkStatus =
  "queued" | "reserved" | "assigned" | "wrap_up" | "done" | "abandoned" | "canceled";
export type WorkKind = "call" | "conversation" | "ticket" | "callback" | "cadence_task" | "handoff";
export type AgentState = "available" | "busy" | "wrap_up" | "paused" | "offline";

export interface Capacity {
  cap_voice: number;
  cap_chat: number;
  cap_email: number;
  cap_task: number;
}

export const DEFAULT_CAPACITY: Capacity = { cap_voice: 1, cap_chat: 4, cap_email: 6, cap_task: 6 };

export function capFor(c: Capacity, cls: CapacityClass): number {
  switch (cls) {
    case "voice":
      return c.cap_voice;
    case "chat":
      return c.cap_chat;
    case "email":
      return c.cap_email;
    default:
      return c.cap_task;
  }
}

/** Carga de 0 (livre) a 1 (cheio): cada item ocupa 1/capacidade do seu canal. */
export function agentLoad(c: Capacity, active: CapacityClass[]): number {
  return active.reduce((sum, cls) => {
    const cap = capFor(c, cls);
    return cap > 0 ? sum + 1 / cap : sum;
  }, 0);
}

/** "1 ligação OU 4 chats OU 6 e-mails": cabe se a carga somada não passar de 1. */
export function fitsCapacity(c: Capacity, load: number, cls: CapacityClass): boolean {
  const cap = capFor(c, cls);
  return cap > 0 && load + 1 / cap <= 1.0001;
}

export function capacityClassOf(channel: string): CapacityClass {
  if (["voice", "phone", "whatsapp_call", "callback"].includes(channel)) return "voice";
  if (channel === "email") return "email";
  if (["ticket", "task", "cadence"].includes(channel)) return "task";
  return "chat";
}

export interface RankableItem {
  id: string;
  sla_due_at: string | null;
  customer_value: number;
  priority: number;
  created_at: string;
}

export function atRisk(due: string | null, now: Date, riskSeconds: number): boolean {
  return due !== null && new Date(due).getTime() <= now.getTime() + riskSeconds * 1000;
}

/** Ordem da fila: SLA a estourar (pelo prazo) > valor do cliente > prioridade > chegada. */
export function rankWorkItems<T extends RankableItem>(
  items: T[],
  now: Date,
  riskSeconds = 120,
): T[] {
  return [...items].sort((a, b) => {
    const ra = atRisk(a.sla_due_at, now, riskSeconds);
    const rb = atRisk(b.sla_due_at, now, riskSeconds);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra && rb) {
      const d = new Date(a.sla_due_at!).getTime() - new Date(b.sla_due_at!).getTime();
      if (d !== 0) return d;
    }
    if (a.customer_value !== b.customer_value) return b.customer_value - a.customer_value;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/** Por que este item está nesta posição, em uma frase para o atendente. */
export function rankReason(item: RankableItem, now: Date, riskSeconds = 120): string {
  if (item.sla_due_at && new Date(item.sla_due_at).getTime() < now.getTime())
    return "Prazo de resposta já passou";
  if (atRisk(item.sla_due_at, now, riskSeconds)) return "Prazo de resposta acabando";
  if (item.customer_value > 0) return "Cliente com negócio em aberto";
  return "Ordem de chegada";
}

export function deriveAgentState(p: {
  chosen: "offline" | "available" | "paused" | null;
  wrapUpUntil: string | null;
  load: number;
  now: Date;
}): AgentState {
  if (!p.chosen || p.chosen === "offline") return "offline";
  if (p.chosen === "paused") return "paused";
  if (p.wrapUpUntil && new Date(p.wrapUpUntil).getTime() > p.now.getTime()) return "wrap_up";
  if (p.load > 0) return "busy";
  return "available";
}

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  available: "Disponível",
  busy: "Em atendimento",
  wrap_up: "Pós-atendimento",
  paused: "Em pausa",
  offline: "Fora",
};

export const KIND_LABEL: Record<WorkKind, string> = {
  call: "Ligação",
  conversation: "Conversa",
  ticket: "Chamado",
  callback: "Retorno de ligação",
  cadence_task: "Tarefa de cadência",
  handoff: "Passagem da IA",
};

export const CHANNEL_LABEL: Record<string, string> = {
  voice: "Telefone",
  whatsapp_call: "Ligação no WhatsApp",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Messenger",
  webchat: "Chat do site",
  email: "E-mail",
  ticket: "Chamado",
  task: "Tarefa",
  sms: "SMS",
  telegram: "Telegram",
};

/** O canal de fila aparece nesta edição? Telefone e ligação no WhatsApp pedem o canal "phone". */
export function queueChannelVisible(ch: string, edition: Edition = EDITION): boolean {
  if (ch === "voice" || ch === "whatsapp_call" || ch === "callback" || ch === "call")
    return hasChannel("phone", edition);
  return hasPlatform(ch, edition);
}

/** O que acontece sem ninguém livre quando a edição não tem telefone (as opções são de ligação). */
export const OVERFLOW_NO_PHONE = "espera na fila até alguém ficar livre";

export function channelLabel(ch: string): string {
  return CHANNEL_LABEL[ch] ?? ch.charAt(0).toUpperCase() + ch.slice(1);
}

export const PAUSE_REASONS = ["Intervalo", "Almoço", "Reunião", "Treinamento", "Banheiro"];

// ───────────────────────── habilidades ─────────────────────────
export function normalizeSkill(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

export interface QueueLike {
  id: string;
  name: string;
  skills: string[];
}

/**
 * A URA com IA diz o assunto em palavras ("quero falar do boleto"). Escolhe a fila cujo nome ou
 * habilidade aparece no texto; empate fica com a primeira. Sem casamento, devolve null e a
 * passagem entra sem habilidade exigida (qualquer pessoa da equipe atende).
 */
export function matchQueue<T extends QueueLike>(queues: T[], spoken: string): T | null {
  const text = ` ${normalizeSkill(spoken)} `;
  if (!text.trim()) return null;
  let best: { q: T; score: number } | null = null;
  for (const q of queues) {
    const terms = [q.name, ...q.skills].map(normalizeSkill).filter((t) => t.length >= 3);
    let score = 0;
    for (const t of terms) {
      if (text.includes(` ${t} `)) score += 3;
      else if (text.includes(t)) score += 2;
      else if (t.split(" ").some((w) => w.length >= 4 && text.includes(w))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { q, score };
  }
  return best?.q ?? null;
}

// ───────────────────────── regras de discagem ─────────────────────────
export interface DialingRules {
  window: { enabled: boolean; start: string; end: string; days: number[] };
  attempts: { enabled: boolean; max_per_number: number; period_days: number };
  dnc: { enabled: boolean };
}

/** Tudo desligado: ligar as regras é escolha (e responsabilidade) da empresa cliente. */
export const DEFAULT_DIALING: DialingRules = {
  window: { enabled: false, start: "09:00", end: "20:00", days: [1, 2, 3, 4, 5] },
  attempts: { enabled: false, max_per_number: 3, period_days: 1 },
  dnc: { enabled: false },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseDialingRules(raw: unknown): DialingRules {
  const r = isObj(raw) ? raw : {};
  const w = isObj(r["window"]) ? r["window"] : {};
  const a = isObj(r["attempts"]) ? r["attempts"] : {};
  const d = isObj(r["dnc"]) ? r["dnc"] : {};
  const days = Array.isArray(w["days"])
    ? [...new Set(w["days"].filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))]
    : DEFAULT_DIALING.window.days;
  const max = Number(a["max_per_number"]);
  const period = Number(a["period_days"]);
  return {
    window: {
      enabled: w["enabled"] === true,
      start:
        typeof w["start"] === "string" && HHMM.test(w["start"])
          ? w["start"]
          : DEFAULT_DIALING.window.start,
      end:
        typeof w["end"] === "string" && HHMM.test(w["end"]) ? w["end"] : DEFAULT_DIALING.window.end,
      days: days.sort((x, y) => x - y),
    },
    attempts: {
      enabled: a["enabled"] === true,
      max_per_number:
        Number.isInteger(max) && max >= 1 && max <= 20
          ? max
          : DEFAULT_DIALING.attempts.max_per_number,
      period_days:
        Number.isInteger(period) && period >= 1 && period <= 30
          ? period
          : DEFAULT_DIALING.attempts.period_days,
    },
    dnc: { enabled: d["enabled"] === true },
  };
}

export function anyRuleOn(r: DialingRules): boolean {
  return r.window.enabled || r.attempts.enabled || r.dnc.enabled;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Hora local (minutos desde 0h) e dia da semana (0 = domingo) no fuso da conta. */
export function clockIn(now: Date, timeZone: string): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")), weekday };
}

export interface DialCheck {
  ok: boolean;
  code?: "window" | "attempts" | "dnc";
  reason?: string;
}

export function checkDialingRules(
  rules: DialingRules,
  ctx: { now: Date; timeZone: string; attempts: number; onDncList: boolean },
): DialCheck {
  if (rules.dnc.enabled && ctx.onDncList)
    return {
      ok: false,
      code: "dnc",
      reason: "Número na lista de não contatar da empresa (regra ligada em Fila e roteamento)",
    };
  if (rules.window.enabled) {
    const { minutes, weekday } = clockIn(ctx.now, ctx.timeZone);
    const s = toMinutes(rules.window.start);
    const e = toMinutes(rules.window.end);
    const inside = s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
    if (!rules.window.days.includes(weekday) || !inside)
      return {
        ok: false,
        code: "window",
        reason: `Fora da janela de ligação definida pela empresa (${rules.window.start} às ${rules.window.end})`,
      };
  }
  if (rules.attempts.enabled && ctx.attempts >= rules.attempts.max_per_number)
    return {
      ok: false,
      code: "attempts",
      reason: `Este número já recebeu ${ctx.attempts} tentativa(s); o teto da empresa é ${rules.attempts.max_per_number} a cada ${rules.attempts.period_days} dia(s)`,
    };
  return { ok: true };
}

/** Prefixo de saída por campanha (ex.: código de operadora). Só dígitos; E.164 sem o "+". */
export function applyDialPrefix(e164: string, prefix: string | null | undefined): string {
  const p = (prefix ?? "").replace(/\D/g, "");
  if (!p) return e164;
  const d = e164.replace(/\D/g, "");
  // Número brasileiro: o prefixo de operadora entra no lugar do DDI (0 + operadora + DDD + número).
  if (d.startsWith("55") && d.length >= 12) return `${p}${d.slice(2)}`;
  return `${p}${d}`;
}

// ───────────────────────── Não Me Perturbe ─────────────────────────
/**
 * Lê o arquivo exportado do Não Me Perturbe (CSV ou TXT, um número por linha ou em colunas).
 * Fica com sequências de 10 a 13 dígitos; número brasileiro sem DDI ganha 55. Sem repetição.
 */
export function parseDncFile(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\+?\d[\d\s().-]{8,20}\d/g)) {
    let d = m[0].replace(/\D/g, "");
    if (d.startsWith("0")) d = d.replace(/^0+/, "");
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    if (d.length >= 12 && d.length <= 13) out.add(d);
  }
  return [...out];
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ───────────────────────── supervisão (Zadarma) ─────────────────────────
export type SuperviseMode = "listen" | "whisper" | "barge";

/** Código de serviço da Zadarma: 007, ramal do atendente e o modo (4 ouvir, 5 sussurrar, 6 entrar). */
export const SUPERVISE_DIGIT: Record<SuperviseMode, string> = {
  listen: "4",
  whisper: "5",
  barge: "6",
};

export const SUPERVISE_LABEL: Record<SuperviseMode, string> = {
  listen: "Ouvir",
  whisper: "Sussurrar",
  barge: "Entrar na ligação",
};

export function superviseSteps(extension: string, mode: SuperviseMode): string[] {
  return [
    "No seu telefone (o do app serve), disque 007 e aperte ligar.",
    `Quando pedir, digite o ramal ${extension}.`,
    `Tecle ${SUPERVISE_DIGIT[mode]} para ${SUPERVISE_LABEL[mode].toLowerCase()}. Dá para trocar de modo durante a ligação: 4 ouvir, 5 sussurrar, 6 entrar.`,
  ];
}

/** Transferência com apresentação na Zadarma: *ramal# fala primeiro com o colega, depois passa. */
export function attendedTransferCode(extension: string): string {
  return `*${extension}#`;
}

export function formatSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return "–";
  const v = Math.max(0, Math.round(s));
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60);
  if (m < 60) return `${m}min ${String(v % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}min`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"} ${h % 24}h`;
}

// ───────────────────────── pós-atendimento ─────────────────────────
export const WRAP_RESULTS = [
  "Resolvido",
  "Retornar depois",
  "Encaminhado para outra área",
  "Venda ou proposta",
  "Sem interesse",
  "Não resolvido",
] as const;

/** CPF, CNPJ, cartão e senha não vão para a IA nem para o log. */
export function maskSensitive(text: string): string {
  return text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[CARTÃO]")
    .replace(/(senha|password)\s*(?:é|e|:|=)?\s*\S+/gi, "$1 [OCULTA]");
}

// ───────────────────────── textos para o cliente ─────────────────────────
export const DIALING_TERM =
  "As regras de discagem são escolha e responsabilidade da sua empresa. O Vínculo entrega a ferramenta e aplica exatamente o que estiver ligado aqui; cumprir a regulação de telecomunicações (Anatel, prefixo 0303, Não Me Perturbe e afins) cabe a quem opera as ligações. Todas as regras vêm desligadas.";

export const OVERFLOW_LABEL: Record<string, string> = {
  callback: "registra um retorno de ligação",
  ai: "a IA de voz atende e oferece retorno ou WhatsApp",
  voicemail: "cai na caixa postal",
  none: "segue o cenário da Zadarma",
};

/** A fila em linguagem simples, para o gestor conferir de bate-pronto. */
export function describeQueue(
  q: {
    channels: string[];
    skills: string[];
    required_level: number;
    sla_seconds: number;
    overflow: string;
  },
  edition: Edition = EDITION,
): string {
  const phone = hasChannel("phone", edition);
  const ch =
    q.channels
      .filter((c) => queueChannelVisible(c, edition))
      .map((c) => channelLabel(c).toLowerCase())
      .join(", ") || "nenhum canal";
  const who = q.skills[0]
    ? `vai para quem sabe "${q.skills[0]}"${q.required_level > 1 ? ` (nível ${q.required_level} ou mais)` : ""}`
    : "vai para qualquer pessoa da equipe";
  const prazo =
    phone && q.channels.includes("voice")
      ? `atender em até ${q.sla_seconds}s`
      : "responder no prazo do canal";
  const overflow = phone ? (OVERFLOW_LABEL[q.overflow] ?? q.overflow) : OVERFLOW_NO_PHONE;
  return `Entra por ${ch}, ${who}. Meta: ${prazo}. Ninguém livre: ${overflow}.`;
}
