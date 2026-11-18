// Regras puras de telefonia (usadas no navegador e no servidor): telefone, status da Zadarma,
// janelas de horário, opt-out falado e a trava de ligações curtas da Anatel.

export function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

// Normaliza para E.164. Número brasileiro sem DDI ganha +55; 0 de tronco e 0XX de operadora saem.
export function toE164(raw: string | null | undefined, defaultCountry = "55"): string | null {
  let d = digits(raw);
  if (!d) return null;
  if ((raw ?? "").trim().startsWith("+")) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.length >= 13 ? d.slice(3) : d.slice(1);
  if (d.length === 10 || d.length === 11) d = defaultCountry + d;
  return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
}

/**
 * Telefone como a base guarda: só dígitos, com DDI. Número brasileiro digitado com DDD
 * ("(11) 90000-0001") ganha o 55; "+1 …" e números com DDI ficam como vieram.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const e164 = toE164(raw, "55");
  if (e164) return e164.slice(1);
  return digits(raw) || null;
}

// Para casar o contato: compara os últimos 8 dígitos (o 9 extra do celular varia na base).
export function phoneKey(raw: string | null | undefined): string {
  const d = digits(raw);
  return d.length >= 8 ? d.slice(-8) : d;
}

export type CallStatus =
  | "ringing"
  | "in_progress"
  | "completed"
  | "missed"
  | "no_answer"
  | "busy"
  | "failed"
  | "voicemail"
  | "canceled";

export interface DispositionResult {
  status: CallStatus;
  reason: string;
}

// "limited by cost" tem dois sentidos opostos na Zadarma: saldo vazio ou o teto de custo por
// minuto do painel. Só o saldo no momento separa um do outro.
export function limitedByCostReason(balanceUsd: number | null): string {
  if (balanceUsd !== null && balanceUsd < 0.5)
    return "Recusada pela Zadarma: saldo esgotado. Recarregue a conta para voltar a ligar.";
  return 'Recusada pelo teto de custo por minuto ("Forbid calls exceeding $/min", no painel da Zadarma › Perfil › Calls). Carregar saldo não resolve: suba o teto.';
}

export function mapDisposition(
  disposition: string | null | undefined,
  direction: "inbound" | "outbound",
  balanceUsd: number | null = null,
): DispositionResult {
  const d = (disposition ?? "").toLowerCase().trim();
  switch (d) {
    case "answered":
      return { status: "completed", reason: "Atendida" };
    case "busy":
      return { status: "busy", reason: "Ocupado" };
    case "no answer":
    case "noanswer":
      return direction === "inbound"
        ? { status: "missed", reason: "Ninguém atendeu" }
        : { status: "no_answer", reason: "O cliente não atendeu" };
    case "cancel":
    case "canceled":
      return direction === "inbound"
        ? { status: "missed", reason: "O cliente desligou antes de ser atendido" }
        : { status: "canceled", reason: "Cancelada" };
    case "no money":
    case "no money, no limit":
      return {
        status: "failed",
        reason: "Recusada pela Zadarma: saldo esgotado. Recarregue a conta para voltar a ligar.",
      };
    case "limited by cost":
      return { status: "failed", reason: limitedByCostReason(balanceUsd) };
    case "unallocated number":
      return { status: "failed", reason: "Número inexistente" };
    case "no limit":
    case "no day limit":
    case "line limit":
      return { status: "failed", reason: "Limite de ligações da conta Zadarma atingido" };
    case "failed":
      return { status: "failed", reason: "Falha na operadora" };
    case "":
      return { status: "completed", reason: "Encerrada" };
    default:
      return { status: "failed", reason: `Encerrada pela operadora (${d})` };
  }
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Hora local (minutos desde 0h) e dia da semana (0 = domingo) no fuso da conta.
export function localClock(now: Date, timeZone: string): { minutes: number; weekday: number } {
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

function between(m: number, start: string, end: string): boolean {
  const s = minutes(start);
  const e = minutes(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

export function inWindow(
  now: Date,
  timeZone: string,
  start: string,
  end: string,
  days: number[],
): boolean {
  const { minutes: m, weekday } = localClock(now, timeZone);
  return days.includes(weekday) && between(m, start, end);
}

// Horário de silêncio (ex.: 21:00 → 08:00) atravessa a meia-noite.
export function inQuietHours(now: Date, timeZone: string, start = "21:00", end = "08:00"): boolean {
  return between(localClock(now, timeZone).minutes, start, end);
}

// Anatel: ligação encerrada em até 6 s conta como abusiva. Pausa o número depois de 2 curtas em
// 24 h e limita a 3 tentativas por dia.
export interface RecentCall {
  started_at: string;
  answered_at: string | null;
  billseconds: number | null;
}

export function outboundGuard(
  recent: RecentCall[],
  now = new Date(),
): { ok: boolean; reason?: string } {
  const day = recent.filter((c) => now.getTime() - new Date(c.started_at).getTime() < 86_400_000);
  const short = day.filter((c) => c.answered_at && (c.billseconds ?? 0) <= 6).length;
  if (short >= 2)
    return {
      ok: false,
      reason:
        "Duas ligações curtas (até 6 s) para este número em 24 h: pausado para não virar ligação abusiva (Anatel).",
    };
  if (day.length >= 3) return { ok: false, reason: "Já foram 3 tentativas para este número hoje." };
  return { ok: true };
}

const OPTOUT_PATTERNS = [
  /n[aã]o (me )?lig(ue|a|uem|ar) mais/,
  /para(r)? de (me )?ligar/,
  /tir(a|e|ar) (o )?meu (n[uú]mero|telefone|contato)/,
  /n[aã]o quero (mais )?(receber )?(liga[cç][aã]o|liga[cç][oõ]es|contato)/,
  /me (remov|tir)(a|e|er) da (sua |de )?lista/,
  /n[aã]o (me )?perturbe/,
  /descadastr/,
];

// Opt-out falado ("não me liga mais") vira supressão de voz. Só olha o que o cliente disse.
export function detectSpokenOptOut(text: string | null | undefined): string | null {
  const t = (text ?? "").toLowerCase();
  for (const p of OPTOUT_PATTERNS) {
    const m = t.match(p);
    if (m) return m[0];
  }
  return null;
}

export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}min${r ? ` ${String(r).padStart(2, "0")}s` : ""}` : `${r}s`;
}

// Quantas ligações o saldo ainda paga (limiar em unidade do negócio, não em dólar).
export function callsLeft(balanceUsd: number, avgCostPerCallUsd: number): number {
  if (avgCostPerCallUsd <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(balanceUsd / avgCostPerCallUsd));
}

export const STATUS_LABEL: Record<CallStatus, string> = {
  ringing: "Tocando",
  in_progress: "Em andamento",
  completed: "Atendida",
  missed: "Perdida",
  no_answer: "Não atendeu",
  busy: "Ocupado",
  failed: "Falhou",
  voicemail: "Caixa postal",
  canceled: "Cancelada",
};

// Redes de origem dos webhooks da Zadarma (liberar também no firewall, se houver).
const ZADARMA_NETS: [string, number][] = [
  ["185.45.152.0", 23],
  ["185.45.155.0", 24],
  ["195.122.19.0", 27],
  ["37.139.38.0", 24],
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => ((acc << 8) + Number(o)) >>> 0, 0);
}

export function isZadarmaIp(ip: string | null): boolean {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const n = ipToInt(ip);
  return ZADARMA_NETS.some(([net, bits]) => {
    const mask = (~0 << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (ipToInt(net) & mask) >>> 0;
  });
}

/**
 * Decide se um webhook da Zadarma pode seguir. Sem IP de origem confiável (cf-connecting-ip)
 * a chamada é recusada: não dá para provar que veio da Zadarma.
 */
export function zadarmaOriginCheck(
  ip: string | null | undefined,
): { ok: true } | { ok: false; reason: "missing_ip" | "forbidden_ip" } {
  if (!ip || ip === "sem-ip") return { ok: false, reason: "missing_ip" };
  return isZadarmaIp(ip.trim()) ? { ok: true } : { ok: false, reason: "forbidden_ip" };
}

/**
 * Lê a resposta de /v1/pbx/internal/create/ e monta ramal + login SIP da PABX
 * (formato da Zadarma: "<pbx_id>-<ramal>"). Devolve null se a resposta não trouxe ramal válido.
 */
export function parseCreatedExtension(
  resp: { numbers?: { number: string | number }[] } | null | undefined,
  pbxId: number | string | null | undefined,
): { extension: string; sipLogin: string | null } | null {
  const raw = resp?.numbers?.[0]?.number;
  const extension = raw == null ? "" : String(raw).trim();
  if (!/^[0-9]{2,6}$/.test(extension)) return null;
  const pbx = pbxId == null ? "" : String(pbxId).trim();
  return { extension, sipLogin: /^[0-9]+$/.test(pbx) ? `${pbx}-${extension}` : null };
}

/** Escolhe o ramal inicial a pedir: "any" deixa a Zadarma escolher o próximo livre. */
export function isValidStartExtension(v: unknown): v is string {
  return typeof v === "string" && /^[1-9][0-9]{2}$/.test(v);
}

/**
 * Ocupação = tempo em ligação ÷ tempo disponível. Sem tempo logado registrado, o disponível é a
 * janela do expediente já decorrida hoje (vezes o número de atendentes, no total da equipe).
 * Devolve null quando não há janela (fora do expediente) para não mostrar uma divisão por zero.
 */
export function occupancyPercent(
  talkSeconds: number,
  windowSeconds: number,
  agents = 1,
): number | null {
  const available = Math.max(0, windowSeconds) * Math.max(0, agents);
  if (!Number.isFinite(available) || available <= 0) return null;
  return Math.min(100, Math.round((100 * Math.max(0, talkSeconds)) / available));
}

export type CallScope = "all" | "missed" | "ai" | "mine";

export interface CallScopeInput {
  status: string;
  answered_at: string | null;
  voice_agent_id: string | null;
  user_id: string | null;
}

/** Perdida: ninguém atendeu e a ligação já acabou. */
export function isMissedCall(c: Pick<CallScopeInput, "status" | "answered_at">): boolean {
  return !c.answered_at && !["ringing", "in_progress"].includes(c.status);
}

/** Recorte das pílulas de Ligações: perdidas, atendidas pela IA de voz ou do usuário logado. */
export function inCallScope(c: CallScopeInput, scope: CallScope, userId: string | null): boolean {
  if (scope === "missed") return isMissedCall(c);
  if (scope === "ai") return Boolean(c.voice_agent_id) && Boolean(c.answered_at);
  if (scope === "mine") return Boolean(userId) && c.user_id === userId;
  return true;
}

export interface TranscriptTurn {
  who: "agent" | "customer";
  text: string;
  /** Segundos desde o início da ligação, quando a fonte informa. */
  at: number | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// Dois formatos chegam em calls.transcript_segments: o da IA de voz ({ speaker: "agent"|"user",
// text, at }) e o do Deepgram ({ speaker: 0|1, transcript, start }, 0 = atendente). Sem segmentos,
// a transcrição em texto ("Atendente: ..." / "Cliente: ...") vira turnos linha a linha.
export function transcriptTurns(segments: unknown, transcript: string | null): TranscriptTurn[] {
  const fromSegments = (Array.isArray(segments) ? segments : [])
    .map((raw): TranscriptTurn | null => {
      const s = asRecord(raw);
      if (!s) return null;
      const text = String(s["text"] ?? s["transcript"] ?? s["message"] ?? "").trim();
      if (!text) return null;
      const speaker = s["speaker"] ?? s["role"];
      const who = speaker === "agent" || speaker === 0 || speaker === "0" ? "agent" : "customer";
      const atRaw = s["at"] ?? s["start"] ?? s["time_in_call_secs"];
      const at = typeof atRaw === "number" && Number.isFinite(atRaw) ? atRaw : null;
      return { who, text, at };
    })
    .filter((t): t is TranscriptTurn => t !== null);
  if (fromSegments.length) return fromSegments;
  if (!transcript?.trim()) return [];
  const turns: TranscriptTurn[] = [];
  for (const line of transcript.split("\n")) {
    const m = /^\s*(Atendente|Agente|IA|Cliente|Usu[aá]rio)\s*:\s*(.*)$/i.exec(line);
    if (m) {
      const label = (m[1] ?? "").toLowerCase();
      const who = label === "cliente" || label.startsWith("usu") ? "customer" : "agent";
      turns.push({ who, text: (m[2] ?? "").trim(), at: null });
    } else if (line.trim()) {
      const last = turns[turns.length - 1];
      if (last) turns[turns.length - 1] = { ...last, text: `${last.text} ${line.trim()}`.trim() };
      else turns.push({ who: "customer", text: line.trim(), at: null });
    }
  }
  return turns.filter((t) => t.text);
}

/** "mm:ss" do instante da fala. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Próximo passo que o resumo da IA gravou em calls.metadata. */
export function callNextStep(metadata: unknown): string | null {
  const v = asRecord(metadata)?.["next_step"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
