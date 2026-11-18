// Regras puras da frente Zernio, usadas na tela e no servidor: destino das ligações, janela de
// 24 h do WhatsApp, catálogo de números e saúde do número de saída.
import { digits, toE164 } from "@/features/telephony/lib";

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Canal de WhatsApp oficial (Meta direta ou pela Zernio): fora de 24 h só com modelo. */
export function isOfficialWhatsApp(
  ch: { provider?: string | null; platform?: string | null } | null | undefined,
): boolean {
  if (!ch) return false;
  return (
    ch.provider === "whatsapp_cloud" || (ch.provider === "zernio" && ch.platform === "whatsapp")
  );
}

export function isOutsideWindow(
  lastInboundAt: string | null | undefined,
  now = Date.now(),
): boolean {
  return !lastInboundAt || now - new Date(lastInboundAt).getTime() > WINDOW_MS;
}

/** Quantas variáveis {{n}} o corpo do modelo pede. */
export function templateVariables(body: string): number {
  const vars = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return vars.length ? Math.max(...vars) : 0;
}

// ------------------------------------------------------------------ destino da ligação

export type ForwardKind = "ai" | "phone" | "zadarma" | "none";

export interface ForwardChoice {
  kind: ForwardKind;
  /** ai: número da Zernio importado na ElevenLabs; phone: celular do atendente. */
  phone?: string;
  /** zadarma: endereço SIP do PABX (ex.: sip:100@pbx.zadarma.com). */
  sipUri?: string;
}

const SIP_URI = /^sip:[A-Za-z0-9.+_-]+@[A-Za-z0-9.-]+(:\d{2,5})?(;[A-Za-z0-9=._-]+)*$/;

/**
 * Monta o `forwardTo` da Zernio. O agente da ElevenLabs entra por SIP com o próprio número em
 * E.164 (igual byte a byte ao importado lá); atendente por `tel:`; central da Zadarma por `sip:`.
 */
export function buildForwardTo(
  choice: ForwardChoice,
): { ok: true; value: string } | { ok: false; error: string } {
  switch (choice.kind) {
    case "none":
      return { ok: true, value: "" };
    case "ai": {
      const e164 = toE164(choice.phone);
      if (!e164) return { ok: false, error: "Número do agente inválido" };
      return { ok: true, value: `sip:${e164}@sip.rtc.elevenlabs.io:5061;transport=tls` };
    }
    case "phone": {
      const e164 = toE164(choice.phone);
      if (!e164) return { ok: false, error: "Informe o celular com DDD" };
      return { ok: true, value: `tel:${e164}` };
    }
    case "zadarma": {
      const uri = (choice.sipUri ?? "").trim();
      if (!SIP_URI.test(uri))
        return { ok: false, error: "Endereço SIP inválido (ex.: sip:100@pbx.zadarma.com)" };
      return { ok: true, value: uri };
    }
  }
}

/** Lê de volta o que está na Zernio para a tela mostrar a escolha certa. */
export function parseForwardTo(value: string | null | undefined): ForwardChoice {
  const v = (value ?? "").trim();
  if (!v) return { kind: "none" };
  if (v.startsWith("tel:")) return { kind: "phone", phone: v.slice(4) };
  const el = /^sip:(\+\d{8,15})@sip\.rtc\.elevenlabs\.io/.exec(v);
  if (el?.[1]) return { kind: "ai", phone: el[1] };
  if (v.startsWith("sip:")) return { kind: "zadarma", sipUri: v };
  return { kind: "none" };
}

export interface HoursChoice {
  enabled: boolean;
  days: number[]; // 0 = domingo
  open: string; // HH:MM
  close: string;
  timezone: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function businessHoursWindows(
  h: HoursChoice,
): { day: number; open: string; close: string }[] {
  if (!h.enabled) return [];
  if (!HHMM.test(h.open) || !HHMM.test(h.close)) throw new Error("Horário no formato HH:MM");
  return [...new Set(h.days)]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((day) => ({ day, open: h.open, close: h.close }));
}

// ------------------------------------------------------------------ catálogo de números

export interface CountryType {
  numberType: string;
  needsKyc: boolean;
  monthlyCents: number;
  whatsappAvailable: boolean;
  smsAvailable: boolean;
  callsAvailable: boolean;
  inStock?: boolean;
  preOrderable?: boolean;
  fulfilment?: string;
}

export interface NumberOffer {
  numberType: "local" | "mobile" | "national" | "toll_free" | string;
  label: string;
  monthlyUsd: number;
  needsKyc: boolean;
  whatsapp: boolean;
  sms: boolean;
  instant: boolean;
  available: boolean;
  note: string;
}

const TYPE_LABEL: Record<string, string> = {
  local: "Fixo local",
  mobile: "Celular",
  national: "Nacional",
  toll_free: "0800",
};

/** Transforma o catálogo ao vivo (`GET /v1/phone-numbers/countries`) em ofertas para leigo. */
export function offersFromCountry(
  country: { types?: CountryType[] } | null | undefined,
): NumberOffer[] {
  return (country?.types ?? []).map((t) => {
    const instant = t.fulfilment !== "request";
    const available = Boolean(t.inStock) || Boolean(t.preOrderable);
    const parts = [
      t.whatsappAvailable ? "WhatsApp e ligação no mesmo número" : "Só ligação",
      t.smsAvailable ? "com SMS" : "sem SMS",
      instant ? "ativa logo após a verificação" : "sob pedido (2 a 4 semanas)",
    ];
    return {
      numberType: t.numberType,
      label: TYPE_LABEL[t.numberType] ?? t.numberType,
      monthlyUsd: Math.round(t.monthlyCents) / 100,
      needsKyc: t.needsKyc,
      whatsapp: t.whatsappAvailable,
      sms: t.smsAvailable,
      instant,
      available,
      note: parts.join(", "),
    };
  });
}

// ------------------------------------------------------------------ saúde do número

export interface NumberHealthRow {
  number: string;
  calls_last_hour: number;
  calls_total: number;
  answered: number;
  short_calls: number;
  avg_duration_seconds: number | null;
}

export type HealthLevel = "ok" | "attention" | "risk";

export interface HealthVerdict {
  level: HealthLevel;
  answerRate: number | null;
  reasons: string[];
}

/** Limites: a Zernio corta em 60 ligações de saída por hora; operadora bloqueia número com muita ligação curta ou recusada. */
export const HEALTH_LIMITS = {
  maxPerHour: 60,
  attentionPerHour: 40,
  minSample: 20,
  riskAnswerRate: 0.15,
  attentionAnswerRate: 0.3,
  shortShareRisk: 0.5,
  minAvgSeconds: 20,
} as const;

export function assessNumberHealth(row: NumberHealthRow): HealthVerdict {
  const L = HEALTH_LIMITS;
  const reasons: string[] = [];
  let level: HealthLevel = "ok";
  const bump = (to: HealthLevel) => {
    if (to === "risk" || (to === "attention" && level === "ok")) level = to;
  };
  const answerRate = row.calls_total > 0 ? row.answered / row.calls_total : null;

  if (row.calls_last_hour >= L.maxPerHour) {
    bump("risk");
    reasons.push(`${row.calls_last_hour} ligações na última hora: no limite da operadora`);
  } else if (row.calls_last_hour >= L.attentionPerHour) {
    bump("attention");
    reasons.push(
      `${row.calls_last_hour} ligações na última hora: perto do limite de ${L.maxPerHour}`,
    );
  }
  if (answerRate !== null && row.calls_total >= L.minSample) {
    const pct = Math.round(answerRate * 100);
    if (answerRate < L.riskAnswerRate) {
      bump("risk");
      reasons.push(`Só ${pct}% atendem: a operadora pode marcar o número como spam`);
    } else if (answerRate < L.attentionAnswerRate) {
      bump("attention");
      reasons.push(`${pct}% atendem: abaixo do saudável`);
    }
  }
  if (row.answered >= 10 && row.short_calls / row.answered >= L.shortShareRisk) {
    bump("risk");
    reasons.push(`${row.short_calls} de ${row.answered} ligações atendidas duram menos de 10 s`);
  } else if (
    row.answered >= 10 &&
    row.avg_duration_seconds !== null &&
    row.avg_duration_seconds < L.minAvgSeconds
  ) {
    bump("attention");
    reasons.push(`Duração média de ${Math.round(row.avg_duration_seconds)} s`);
  }
  return { level, answerRate, reasons };
}

export function participantId(phone: string | null | undefined): string | null {
  const e164 = toE164(phone);
  return e164 ? digits(e164) : null;
}

// Motivo da Zernio para "não dá para portar" em frase de leigo, com o caminho que resolve.
// A Zernio não publica a lista de códigos; os conhecidos têm texto próprio e o resto cai no genérico.
const PORT_REASONS: Record<string, string> = {
  no_coverage:
    "a Zernio ainda não traz números deste tipo para cá. Se ele já tem WhatsApp, conecte o próprio aparelho (sem portar nada) ou contrate um número fixo novo",
  not_portable:
    "a operadora atual não libera a portabilidade. Se ele já tem WhatsApp, conecte o próprio aparelho (sem portar nada)",
  invalid_number: "o número parece incompleto. Confira o DDD e os dígitos",
  already_on_zernio: "este número já está na Zernio. Conecte-o em Canais em vez de portar",
};

export function portReasonText(reason: string | null | undefined): string {
  const code = (reason ?? "").trim();
  if (!code) return "a operadora atual não libera a portabilidade";
  const known = PORT_REASONS[code.toLowerCase()];
  if (known) return known;
  // texto já humano (com espaço e sem cara de código) passa como veio
  return /\s/.test(code) && !/^[a-z0-9_]+$/.test(code)
    ? code.replace(/\.$/, "")
    : "a Zernio não aceitou a portabilidade deste número agora";
}
