// Amazon SES v2 (SendEmail por HTTP, assinado com SigV4 próprio; sem SDK).
// Docs: https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
import { buildMime } from "@/backend/email/mime";

import { signRequest } from "./aws-sigv4";

export interface SesCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SesMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  attachments?: { filename: string; content: string; content_type?: string }[];
}

// Região vira parte do host: só o formato da AWS passa (evita apontar a chamada para outro lugar).
const REGION = /^[a-z]{2}(-gov)?-[a-z]+-\d{1,2}$/;
export function isValidRegion(v: string | undefined | null): v is string {
  return typeof v === "string" && REGION.test(v);
}

const TAG = /^[A-Za-z0-9_-]{1,256}$/;

/** Corpo do SendEmail: Simple (com cabeçalhos) ou Raw quando há anexo. */
export function sesSendBody(m: SesMessage): Record<string, unknown> {
  const tags = (m.tags ?? [])
    .filter((t) => TAG.test(t.name) && TAG.test(t.value))
    .map((t) => ({ Name: t.name, Value: t.value }));
  const base: Record<string, unknown> = {
    FromEmailAddress: m.from,
    Destination: { ToAddresses: m.to },
    ...(m.replyTo ? { ReplyToAddresses: [m.replyTo] } : {}),
    ...(tags.length ? { EmailTags: tags } : {}),
  };
  if (m.attachments?.length) {
    const raw = buildMime({ ...m, text: m.text ?? null });
    return { ...base, Content: { Raw: { Data: Buffer.from(raw, "utf8").toString("base64") } } };
  }
  const headers = Object.entries(m.headers ?? {})
    .filter(([k]) => /^[A-Za-z0-9-]{1,64}$/.test(k))
    .map(([Name, Value]) => ({ Name, Value: Value.replace(/[\r\n]+/g, " ") }));
  return {
    ...base,
    Content: {
      Simple: {
        Subject: { Data: m.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: m.html, Charset: "UTF-8" },
          ...(m.text ? { Text: { Data: m.text, Charset: "UTF-8" } } : {}),
        },
        ...(headers.length ? { Headers: headers } : {}),
      },
    },
  };
}

async function sesCall<T>(
  creds: SesCredentials,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!isValidRegion(creds.region)) throw new Error("Região da AWS inválida (ex.: sa-east-1)");
  const url = `https://email.${creds.region}.amazonaws.com${path}`;
  const payload = body ? JSON.stringify(body) : "";
  const signed = signRequest({
    method,
    url,
    region: creds.region,
    service: "ses",
    headers: body ? { "content-type": "application/json" } : {},
    body: payload,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });
  const { host: _host, ...headers } = signed.headers;
  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: payload } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as T & { message?: string; Message?: string };
  if (!res.ok) throw new Error(`SES ${res.status}: ${j.message ?? j.Message ?? "falha"}`);
  return j;
}

export async function sesSend(creds: SesCredentials, m: SesMessage): Promise<{ id: string }> {
  const j = await sesCall<{ MessageId?: string }>(
    creds,
    "POST",
    "/v2/email/outbound-emails",
    sesSendBody(m),
  );
  if (!j.MessageId) throw new Error("SES: envio sem MessageId");
  return { id: j.MessageId };
}

export async function sesTest(creds: SesCredentials): Promise<string> {
  const j = await sesCall<{
    SendingEnabled?: boolean;
    ProductionAccessEnabled?: boolean;
    SendQuota?: { Max24HourSend?: number };
  }>(creds, "GET", "/v2/email/account");
  if (j.SendingEnabled === false) throw new Error("Envio desativado nesta conta do SES");
  return j.ProductionAccessEnabled
    ? `Conta em produção, até ${j.SendQuota?.Max24HourSend ?? "?"} e-mails por dia`
    : "Chave válida, mas a conta do SES ainda está no sandbox (só envia para endereços verificados)";
}
