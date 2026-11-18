// SMS pela Zadarma. Puro: lê o aviso de SMS recebido (event=SMS) e monta a mensagem da ingestão.
// O aviso traz `result` em JSON com caller_id (quem mandou), caller_did (nosso número) e text.
import { createHash } from "node:crypto";

import { toE164 } from "@/features/telephony/lib";

import type { NormalizedMessage } from "./zernio-normalize";

export interface ZadarmaSmsInbound {
  from: string;
  to: string | null;
  text: string;
}

/** `result` do aviso SMS da Zadarma → remetente, destino e texto. Null se não der para ler. */
export function parseZadarmaSmsResult(result: string | undefined | null): ZadarmaSmsInbound | null {
  if (!result) return null;
  let r: unknown;
  try {
    r = JSON.parse(result);
  } catch {
    return null;
  }
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);
  const from = toE164(str(o["caller_id"]));
  const text = str(o["text"]) ?? "";
  if (!from || !text.trim()) return null;
  return { from, to: toE164(str(o["caller_did"])), text: text.slice(0, 4000) };
}

/** Janela em que o mesmo aviso reenviado pela Zadarma conta como repetido. */
export const SMS_DEDUPE_WINDOW_MS = 30_000;

/**
 * SMS recebido → mensagem no formato da ingestão. A Zadarma não manda id nem hora do SMS: o id
 * externo é o hash do aviso + a janela de 30 s em que chegou. O mesmo aviso reenviado logo em
 * seguida não entra duas vezes; o cliente que manda "ok" de novo depois entra normalmente.
 */
export function normalizeZadarmaSms(
  result: string,
  sms: ZadarmaSmsInbound,
  receivedAt: number = Date.now(),
): NormalizedMessage {
  const bucket = Math.floor(receivedAt / SMS_DEDUPE_WINDOW_MS);
  const externalId = `zadarma-sms:${createHash("sha1").update(`${bucket}:${result}`).digest("hex")}`;
  return {
    externalId,
    direction: "in",
    threadId: sms.from,
    isGroup: false,
    senderHandle: sms.from,
    senderName: null,
    contactPhone: sms.from,
    type: "text",
    body: sms.text,
    media: null,
    sentAt: null,
    metadata: { provider: "zadarma" },
  };
}

/** Número de remetente do canal SMS em E.164 ou null. */
export function smsSender(raw: string | undefined | null): string | null {
  const v = toE164(raw ?? "");
  return v && /^\+[1-9]\d{9,14}$/.test(v) ? v : null;
}

/** Teto diário de SMS por conta: padrão 300, entre 1 e 5000. */
export const SMS_DAILY_CAP_DEFAULT = 300;
export function smsDailyCap(raw: string | undefined | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return SMS_DAILY_CAP_DEFAULT;
  return Math.min(Math.floor(n), 5000);
}
