// Amazon SNS → eventos da SES (entrega, devolução, reclamação). Puro: monta o texto assinado,
// valida a origem do certificado e lê o evento. Docs: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
import type { DeliveryKind } from "./events.server";

export interface SnsMessage {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation" | string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
const SUBSCRIPTION_KEYS = [
  "Message",
  "MessageId",
  "SubscribeURL",
  "Timestamp",
  "Token",
  "TopicArn",
  "Type",
];

/** Texto que a AWS assinou: pares "chave\nvalor\n" em ordem alfabética, só os campos do tipo. */
export function stringToSign(m: SnsMessage): string {
  const keys = m.Type === "Notification" ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS;
  return keys
    .filter((k) => (m as unknown as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${k}\n${(m as unknown as Record<string, string>)[k]}\n`)
    .join("");
}

/** Certificado e URL de inscrição só podem vir de um host da SNS (evita assinatura forjada). */
export function isSnsUrl(raw: string | undefined, kind: "cert" | "subscribe"): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (!/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname)) return false;
    return kind === "cert" ? u.pathname.endsWith(".pem") : true;
  } catch {
    return false;
  }
}

export interface SesEvent {
  providerId: string;
  kind: DeliveryKind;
  detail: string | null;
}

/** Evento da SES dentro do Message da SNS (formato de notificação ou de "event publishing"). */
export function parseSesEvent(message: string): SesEvent | null {
  let j: {
    notificationType?: string;
    eventType?: string;
    mail?: { messageId?: string };
    bounce?: { bounceType?: string; bouncedRecipients?: { diagnosticCode?: string }[] };
  };
  try {
    j = JSON.parse(message);
  } catch {
    return null;
  }
  const type = j.eventType ?? j.notificationType;
  const providerId = j.mail?.messageId;
  if (!providerId) return null;
  if (type === "Delivery") return { providerId, kind: "delivered", detail: null };
  if (type === "Complaint") return { providerId, kind: "complaint", detail: null };
  if (type === "Bounce") {
    // devolução temporária (caixa cheia) não suprime o endereço
    if (j.bounce?.bounceType === "Transient") return null;
    const code =
      j.bounce?.bouncedRecipients?.[0]?.diagnosticCode ?? j.bounce?.bounceType ?? "bounce";
    return { providerId, kind: "bounce", detail: code };
  }
  return null;
}
