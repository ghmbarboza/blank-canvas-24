// Previsão de volume por hora e canal: média sazonal do mesmo dia da semana e da mesma hora nas
// últimas semanas, com peso maior nas mais recentes. Explicável: cada número diz de onde veio.
import { backlogAgents, requiredAgents } from "./erlang";

export interface HistoryRow {
  channel: string;
  day: string; // YYYY-MM-DD no fuso da conta
  hour: number; // 0..23
  arrivals: number;
  handle_seconds: number | null;
}

export interface HourForecast {
  hour: number;
  expected: number;
  /** Valores das semanas usadas (mais recente primeiro), para a explicação. */
  samples: number[];
}

export interface ChannelForecast {
  channel: string;
  hours: HourForecast[];
  total: number;
  weeksUsed: number;
}

export const REALTIME_CHANNELS = new Set([
  "voice",
  "whatsapp",
  "instagram",
  "facebook",
  "telegram",
  "tiktok",
  "x",
  "webchat",
  "sms",
  "linkedin",
  "threads",
]);

export const CHANNEL_LABEL: Record<string, string> = {
  voice: "Ligações",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  x: "X",
  webchat: "Chat do site",
  sms: "SMS",
  ticket: "Chamados",
  email: "E-mail",
  linkedin: "LinkedIn",
  threads: "Threads",
};

export function channelLabel(ch: string): string {
  return CHANNEL_LABEL[ch] ?? ch;
}

/** Data (YYYY-MM-DD) somando dias, sem fuso: só calendário. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  return dt.toISOString().slice(0, 10);
}

export function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/**
 * Previsão para `target`. Usa as `weeks` ocorrências anteriores do mesmo dia da semana; semanas
 * antes do primeiro registro do canal não contam (não são "zero", são "ainda não usava").
 * Peso linear: a semana mais recente vale `weeks`, a mais antiga vale 1.
 */
export function forecastDay(rows: HistoryRow[], target: string, weeks = 8): ChannelForecast[] {
  const byChannel = new Map<string, Map<string, number>>();
  const firstDay = new Map<string, string>();
  for (const r of rows) {
    if (r.day >= target) continue;
    const m = byChannel.get(r.channel) ?? new Map<string, number>();
    m.set(`${r.day}|${r.hour}`, (m.get(`${r.day}|${r.hour}`) ?? 0) + r.arrivals);
    byChannel.set(r.channel, m);
    const f = firstDay.get(r.channel);
    if (!f || r.day < f) firstDay.set(r.channel, r.day);
  }
  const out: ChannelForecast[] = [];
  for (const [channel, cells] of byChannel) {
    const first = firstDay.get(channel) ?? target;
    const days: string[] = [];
    for (let w = 1; w <= weeks; w += 1) {
      const d = addDays(target, -7 * w);
      if (d >= first) days.push(d);
    }
    if (days.length === 0) continue;
    const hours: HourForecast[] = [];
    let total = 0;
    for (let h = 0; h < 24; h += 1) {
      const samples = days.map((d) => cells.get(`${d}|${h}`) ?? 0);
      let num = 0;
      let den = 0;
      samples.forEach((v, i) => {
        const weight = days.length - i;
        num += v * weight;
        den += weight;
      });
      const expected = den > 0 ? num / den : 0;
      total += expected;
      hours.push({ hour: h, expected: Math.round(expected * 10) / 10, samples });
    }
    out.push({ channel, hours, total: Math.round(total), weeksUsed: days.length });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** TMA por canal: o que o gestor configurou vence; depois o histórico; depois um padrão sensato. */
export const DEFAULT_AHT: Record<string, number> = {
  voice: 240,
  ticket: 900,
  email: 480,
};
export const DEFAULT_TEXT_AHT = 420;

export function ahtFor(channel: string, configured: Record<string, number>, rows: HistoryRow[]) {
  const c = configured[channel];
  if (typeof c === "number" && c > 0) return { seconds: c, source: "configurado" as const };
  const handled = rows.filter((r) => r.channel === channel && r.handle_seconds && r.arrivals > 0);
  if (handled.length > 0) {
    const sum = handled.reduce((s, r) => s + (r.handle_seconds ?? 0) * r.arrivals, 0);
    const n = handled.reduce((s, r) => s + r.arrivals, 0);
    if (n > 0) return { seconds: Math.round(sum / n), source: "histórico" as const };
  }
  return {
    seconds: DEFAULT_AHT[channel] ?? DEFAULT_TEXT_AHT,
    source: "padrão" as const,
  };
}

export interface StaffingSettings {
  serviceLevel: number; // 0..1
  answerSeconds: number;
  shrinkage: number; // 0..0.7
  chatConcurrency: number;
  aht: Record<string, number>;
}

export interface HourStaffing {
  hour: number;
  arrivals: number;
  agents: number; // no posto
  scheduled: number; // com a perda
  byChannel: Record<string, number>;
}

/**
 * Pessoas por hora somando os canais. Voz usa Erlang C puro; texto usa Erlang C com atendimento
 * simultâneo; chamado e e-mail entram como carga de trabalho (sem fila de segundos).
 */
export function staffingPlan(
  forecast: ChannelForecast[],
  rows: HistoryRow[],
  s: StaffingSettings,
): HourStaffing[] {
  const plan: HourStaffing[] = [];
  for (let h = 0; h < 24; h += 1) {
    let agents = 0;
    let arrivals = 0;
    const byChannel: Record<string, number> = {};
    for (const f of forecast) {
      const expected = f.hours[h]?.expected ?? 0;
      if (expected <= 0) continue;
      arrivals += expected;
      const aht = ahtFor(f.channel, s.aht, rows).seconds;
      const n = REALTIME_CHANNELS.has(f.channel)
        ? requiredAgents({
            arrivals: expected,
            ahtSeconds: aht,
            serviceLevel: s.serviceLevel,
            answerSeconds: s.answerSeconds,
            concurrency: f.channel === "voice" ? 1 : s.chatConcurrency,
          }).agents
        : backlogAgents(expected, aht).agents;
      byChannel[f.channel] = n;
      agents += n;
    }
    plan.push({
      hour: h,
      arrivals: Math.round(arrivals * 10) / 10,
      agents,
      scheduled: agents === 0 ? 0 : Math.ceil(agents / (1 - Math.min(0.7, s.shrinkage))),
      byChannel,
    });
  }
  return plan;
}

export interface DaySummary {
  peakHour: number | null;
  peakPeople: number;
  /** Primeira e última hora com gente necessária. */
  firstHour: number | null;
  lastHour: number | null;
  totalArrivals: number;
  /** Horas-pessoa no dia (soma das pessoas por hora). */
  personHours: number;
}

export function summarize(plan: HourStaffing[]): DaySummary {
  let peakHour: number | null = null;
  let peakPeople = 0;
  let firstHour: number | null = null;
  let lastHour: number | null = null;
  let totalArrivals = 0;
  let personHours = 0;
  for (const p of plan) {
    totalArrivals += p.arrivals;
    personHours += p.scheduled;
    if (p.scheduled > 0) {
      if (firstHour === null) firstHour = p.hour;
      lastHour = p.hour;
    }
    if (p.scheduled > peakPeople) {
      peakPeople = p.scheduled;
      peakHour = p.hour;
    }
  }
  return {
    peakHour,
    peakPeople,
    firstHour,
    lastHour,
    totalArrivals: Math.round(totalArrivals),
    personHours,
  };
}

/** Frase que explica a previsão de uma hora, em português direto. */
export function explainHour(f: ChannelForecast, hour: number): string {
  const h = f.hours[hour];
  if (!h) return "";
  const list = h.samples.join(", ");
  return `${channelLabel(f.channel)} às ${hour}h: média das últimas ${f.weeksUsed} semanas no mesmo dia (${list}), com peso maior nas mais recentes = ${h.expected.toLocaleString("pt-BR")}.`;
}
