// Zadarma API v1: assinatura HMAC-SHA1 do método + parâmetros. Docs: https://zadarma.com/en/support/api/
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.zadarma.com";

export interface ZadarmaCreds {
  key: string;
  secret: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map(
      (k) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k])).replace(/%20/g, "+")}`,
    )
    .join("&");
}

export function zadarmaSign(creds: ZadarmaCreds, method: string, query: string): string {
  const md5 = createHash("md5").update(query).digest("hex");
  const hex = createHmac("sha1", creds.secret)
    .update(method + query + md5)
    .digest("hex");
  return Buffer.from(hex).toString("base64");
}

export async function zadarma<T>(
  creds: ZadarmaCreds,
  method: string,
  params: Record<string, string | number | undefined> = {},
  verb: "GET" | "POST" | "PUT" = "GET",
): Promise<T> {
  const query = buildQuery(params);
  const auth = `${creds.key}:${zadarmaSign(creds, method, query)}`;
  const url = verb === "GET" && query ? `${BASE}${method}?${query}` : `${BASE}${method}`;
  const res = await fetch(url, {
    method: verb,
    headers: {
      authorization: auth,
      ...(verb !== "GET" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(verb !== "GET" ? { body: query } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as T & { status?: string; message?: string };
  if (!res.ok || j.status === "error")
    throw new Error(`Zadarma ${method}: ${j.message ?? res.status}`);
  return j;
}

export async function zadarmaTest(creds: ZadarmaCreds): Promise<string> {
  const b = await zadarma<{ balance: number; currency: string }>(creds, "/v1/info/balance/");
  return `Conta ativa. Saldo: ${b.balance} ${b.currency}`;
}

export function zadarmaBalance(creds: ZadarmaCreds) {
  return zadarma<{ balance: number; currency: string }>(creds, "/v1/info/balance/");
}

// Callback: toca primeiro `from` (ramal/celular do vendedor) e depois liga para `to`.
export function zadarmaCallback(creds: ZadarmaCreds, from: string, to: string, sip?: string) {
  return zadarma<{ from: string; to: string; time: number }>(creds, "/v1/request/callback/", {
    from,
    to,
    ...(sip ? { sip } : {}),
  });
}

export function zadarmaWebrtcKey(creds: ZadarmaCreds, sip: string) {
  return zadarma<{ key: string }>(creds, "/v1/webrtc/get_key/", { sip });
}

export function zadarmaRecording(creds: ZadarmaCreds, callId: string) {
  return zadarma<{ link?: string; links?: string[] }>(creds, "/v1/pbx/record/request/", {
    pbx_call_id: callId,
    lifetime: 86400,
  });
}

// SMS: POST /v1/sms/send/ com number, message e sender (número virtual ou nome liberado na conta).
// O parâmetro é `sender`, não `caller_id` (docs lidas em 04/11/2026).
export function zadarmaSms(creds: ZadarmaCreds, number: string, message: string, sender?: string) {
  return zadarma<{
    status?: string;
    messages?: number;
    denied_numbers?: { number: string; message: string }[];
  }>(creds, "/v1/sms/send/", { number, message, ...(sender ? { sender } : {}) }, "POST");
}

// Remetentes que a conta pode usar para um destino: GET /v1/sms/senderid/?phones=<número>.
export function zadarmaSmsSenders(creds: ZadarmaCreds, phone: string) {
  return zadarma<{ senders?: string[] }>(creds, "/v1/sms/senderid/", { phones: phone });
}

export function zadarmaStatistics(creds: ZadarmaCreds, start: string, end: string) {
  return zadarma<{ stats?: unknown[] }>(creds, "/v1/statistics/pbx/", { start, end, version: 2 });
}

export function zadarmaInternals(creds: ZadarmaCreds) {
  return zadarma<{ numbers?: string[]; pbx_id?: number }>(creds, "/v1/pbx/internal/");
}

// Cria ramal(is) na PABX: POST /v1/pbx/internal/create/ (start_number 100-999 ou "any").
// Não pedimos a senha de volta: o softphone do navegador entra pela chave WebRTC, sem senha SIP.
export function zadarmaCreateInternal(creds: ZadarmaCreds, startNumber: string | number = "any") {
  return zadarma<{ status?: string; numbers?: { number: string | number; password?: string }[] }>(
    creds,
    "/v1/pbx/internal/create/",
    { start_number: startNumber, quantity: 1, return_password: "false" },
    "POST",
  );
}

// Webhook notify_*: Signature = base64(hmac_sha1(<campos do evento>, secret)).
export function verifyZadarmaNotify(
  creds: ZadarmaCreds,
  event: string,
  form: Record<string, string>,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const fieldsByEvent: Record<string, string[]> = {
    NOTIFY_START: ["caller_id", "called_did", "call_start"],
    NOTIFY_INTERNAL: ["caller_id", "called_did", "call_start"],
    NOTIFY_ANSWER: ["caller_id", "destination", "call_start"],
    NOTIFY_END: ["caller_id", "called_did", "call_start"],
    NOTIFY_OUT_START: ["internal", "destination", "call_start"],
    NOTIFY_OUT_END: ["internal", "destination", "call_start"],
    NOTIFY_RECORD: ["pbx_call_id", "call_id_with_rec"],
    NOTIFY_IVR: ["caller_id", "called_did", "call_start"],
    SMS: ["result"],
  };
  const fields = fieldsByEvent[event];
  if (!fields) return false;
  const data = fields.map((f) => form[f] ?? "").join("");
  // A Zadarma assina com base64_encode(hash_hmac('sha1', dados, secret)) do PHP: o HMAC sai em
  // hexadecimal e o base64 é do texto hex. Aceitamos também o base64 dos bytes crus.
  const mac = createHmac("sha1", creds.secret).update(data);
  const hex = mac.digest("hex");
  const candidates = [
    Buffer.from(hex).toString("base64"),
    Buffer.from(hex, "hex").toString("base64"),
  ];
  const got = Buffer.from(signature);
  return candidates.some((c) => {
    const exp = Buffer.from(c);
    return exp.length === got.length && timingSafeEqual(exp, got);
  });
}

// Supervisão (escuta, sussurro e entrada). A API da Zadarma NÃO controla a ligação em andamento:
// ela só liga o "modo supervisor" no ramal (PUT /v1/pbx/internal/<ramal>/edit/ supervisor_status).
// Com o modo ligado, o supervisor disca 007 no próprio ramal, digita o ramal do atendente e
// escolhe 4 (ouvir), 5 (sussurrar) ou 6 (entrar). Fonte: zadarma.com/en/support/api e
// zadarma.com/en/support/faq/pbx/supervisor (lidos em 26/10/2026).
export function zadarmaInternalInfo(creds: ZadarmaCreds, extension: string) {
  return zadarma<{
    number?: number | string;
    name?: string;
    lines?: string;
    supervisor_status?: number | string;
  }>(creds, `/v1/pbx/internal/${encodeURIComponent(extension)}/info/`);
}

export function zadarmaSetSupervisor(creds: ZadarmaCreds, extension: string, on: boolean) {
  return zadarma<{ status?: string }>(
    creds,
    `/v1/pbx/internal/${encodeURIComponent(extension)}/edit/`,
    { supervisor_status: on ? 1 : 0 },
    "PUT",
  );
}
