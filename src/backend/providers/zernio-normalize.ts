// Normalização dos webhooks da Zernio (puro, sem rede nem banco: testável).
// Contrato conferido em docs.zernio.com/webhooks/{inbox,calls,phone-numbers} em 26/10/2026.
import { createHmac, timingSafeEqual } from "node:crypto";

import { digits, toE164, type CallStatus } from "@/features/telephony/lib";

import type { ZernioLead } from "./zernio-leads";

/** X-Zernio-Signature: HMAC-SHA256 hex (minúsculo) do corpo cru, com o segredo do webhook. */
export function signatureOk(secret: string, raw: string, header: string | null): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.trim().toLowerCase());
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Status de entrega; nunca regride (lido não volta a entregue; lido não vira falha). */
export function nextStatus(current: string, incoming: string): string | null {
  if (!(incoming in RANK)) return null;
  if (incoming === "failed") return current === "read" || current === "failed" ? null : "failed";
  return (RANK[current] ?? 0) >= (RANK[incoming] ?? 0) ? null : incoming;
}

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "template"
  | "reaction"
  | "system";

/** Mesmo formato do NormalizedMessage do edge (`_shared/ingest.ts`). */
export interface NormalizedMessage {
  externalId: string | null;
  direction: "in" | "out";
  threadId: string;
  isGroup: boolean;
  groupTitle?: string | null;
  senderHandle: string | null;
  senderName: string | null;
  senderAvatar?: string | null;
  contactPhone?: string | null;
  type: MessageType;
  body: string | null;
  media?: {
    url: string;
    mime?: string | undefined;
    name?: string | undefined;
    auth: boolean;
  } | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown>;
  /** Anúncio ou link que abriu a conversa (metadata.ad / metadata.referral da Zernio). */
  origin?: Record<string, unknown> | null;
}

export interface ZernioSender {
  id?: string;
  name?: string;
  username?: string;
  picture?: string;
  phoneNumber?: string | null;
  businessScopedUserId?: string;
  parentBusinessScopedUserId?: string;
  whatsappUsername?: string;
  contactId?: string;
}

export interface ZernioAttachment {
  type?: string;
  originalType?: string;
  url?: string;
  mimeType?: string;
  filename?: string;
  payload?: { voice?: boolean };
}

export interface ZernioMessage {
  id?: string;
  conversationId?: string;
  platform?: string;
  platformMessageId?: string;
  direction?: "incoming" | "outgoing";
  text?: string | null;
  attachments?: ZernioAttachment[];
  sender?: ZernioSender;
  sentAt?: string;
  sentVia?: string | null;
  source?: string;
}

export interface ZernioAccountRef {
  id?: string;
  accountId?: string;
  profileId?: string;
  platform?: string;
  username?: string;
  displayName?: string | null;
}

export interface ZernioCall {
  id?: string;
  metaCallId?: string | null;
  accountId?: string;
  phoneNumberId?: string;
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string;
  forwardTo?: string;
  contactId?: string;
  conversationId?: string;
  startedAt?: string;
  endedAt?: string;
  failedAt?: string;
  durationSeconds?: number;
  endReason?: "hangup" | "no_answer" | "rejected" | "error";
  hangupCause?: string | null;
  sipHangupCause?: string | null;
  isVoicemail?: boolean;
  recordingUrl?: string;
  recordingExpiresAt?: string;
  error?: { code?: number; message?: string };
  billing?: {
    metaCostUSD?: number;
    telnyxCostUSD?: number;
    recordingCostUSD?: number;
    transcriptionCostUSD?: number;
    billableCostUSD?: number;
    totalCostUSD?: number;
  };
}

export interface ZernioNumberRef {
  id?: string;
  phoneNumber?: string | null;
  country?: string;
  profileId?: string;
}

export interface ZernioEvent {
  id?: string;
  event?: string;
  test?: boolean;
  message?: ZernioMessage;
  conversation?: { id?: string; isGroup?: boolean; title?: string; status?: string };
  account?: ZernioAccountRef;
  metadata?: Record<string, unknown> | null;
  error?: { code?: number; title?: string; message?: string } | null;
  pricing?: { billable?: boolean; category?: string; type?: string } | null;
  call?: ZernioCall;
  permission?: {
    from?: string;
    response?: "accept" | "reject";
    isPermanent?: boolean;
    expirationTimestamp?: string;
  };
  number?: ZernioNumberRef;
  reason?: string | null;
  verificationUrl?: string;
  timestamp?: string;
  /** lead.received: lead de formulário de anúncio (Meta), já com as respostas. */
  lead?: ZernioLead;
}

export type EventKind =
  | "message"
  | "status"
  | "account"
  | "call"
  | "permission"
  | "number"
  | "identity"
  | "lead"
  | "ignored";

export function eventKind(name: string): EventKind {
  if (name === "message.received" || name === "message.sent") return "message";
  if (["message.delivered", "message.read", "message.played", "message.failed"].includes(name))
    return "status";
  if (name === "account.connected" || name === "account.disconnected") return "account";
  if (name === "call.received" || name === "call.ended" || name === "call.failed") return "call";
  if (name === "call.permission_request") return "permission";
  if (name.startsWith("whatsapp.number.")) return "number";
  if (name === "whatsapp.contact.identity_changed") return "identity";
  if (name === "lead.received") return "lead";
  return "ignored";
}

/** Eventos que pedimos à Zernio no webhook único da conta. */
export const ZERNIO_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "account.connected",
  "account.disconnected",
  "call.received",
  "call.ended",
  "call.failed",
  "call.permission_request",
  "whatsapp.number.kyc_submitted",
  "whatsapp.number.activated",
  "whatsapp.number.declined",
  "whatsapp.number.action_required",
  "whatsapp.number.verification_required",
  "whatsapp.number.suspended",
  "whatsapp.number.reactivated",
  "whatsapp.number.released",
  "whatsapp.contact.identity_changed",
  "lead.received",
] as const;

export function zernioAccountOf(evt: ZernioEvent): string | null {
  return evt.account?.accountId ?? evt.account?.id ?? evt.call?.accountId ?? null;
}

// Plataforma Zernio → channels.platform.
export function toPlatform(p: string | undefined): string {
  const map: Record<string, string> = { twitter: "x", googlebusiness: "google_business" };
  return p ? (map[p] ?? p) : "instagram";
}

function attachmentType(att: ZernioAttachment): MessageType {
  const t = att.type ?? "";
  if (t === "image") return "image";
  if (t === "video") return "video";
  if (t === "audio") return "audio";
  if (t === "sticker") return "sticker";
  return "document";
}

/**
 * Remetente estável. No WhatsApp o `sender.id` é o telefone quando a Meta manda e o BSUID
 * quando o cliente usa nome de usuário (#19); o BSUID é a âncora recomendada pela Zernio.
 */
export function senderIdentity(m: ZernioMessage): { handle: string | null; phone: string | null } {
  const s = m.sender ?? {};
  if (m.platform === "whatsapp") {
    const fromId = s.id && /^\+?\d{8,15}$/.test(s.id) ? digits(s.id) : null;
    const phone = digits(s.phoneNumber ?? "") || fromId;
    return { handle: s.businessScopedUserId ?? s.id ?? phone ?? null, phone: phone || null };
  }
  return { handle: s.username ?? s.id ?? null, phone: digits(s.phoneNumber ?? "") || null };
}

export function normalizeMessage(evt: ZernioEvent): NormalizedMessage | null {
  const m = evt.message;
  if (!m) return null;
  const threadId = m.conversationId ?? evt.conversation?.id;
  if (!threadId) return null;
  const att = m.attachments?.[0];
  if (!m.text && !att) return null;
  const who = senderIdentity(m);
  const isWhatsApp = m.platform === "whatsapp";
  const metadata: Record<string, unknown> = { zernio_message_id: m.id ?? null };
  if (evt.metadata?.["standby"] === true) metadata["standby"] = true;
  if (att?.payload?.voice) metadata["voice_note"] = true;
  if (m.sender?.businessScopedUserId) metadata["bsuid"] = m.sender.businessScopedUserId;
  if (m.sender?.whatsappUsername) metadata["whatsapp_username"] = m.sender.whatsappUsername;
  if (m.source) metadata["source"] = m.source;
  return {
    externalId: m.platformMessageId ?? m.id ?? null,
    direction: m.direction === "outgoing" ? "out" : "in",
    threadId,
    isGroup: Boolean(evt.conversation?.isGroup),
    groupTitle: evt.conversation?.title ?? null,
    senderHandle: who.handle,
    senderName: m.sender?.name ?? m.sender?.whatsappUsername ?? m.sender?.username ?? null,
    senderAvatar: m.sender?.picture ?? null,
    contactPhone: who.phone,
    type: att ? attachmentType(att) : "text",
    body: m.text ?? null,
    // WhatsApp: a mídia mora em /v1/whatsapp/media/{id} e exige a chave (Bearer) para baixar.
    media: att?.url
      ? { url: att.url, mime: att.mimeType, name: att.filename, auth: isWhatsApp }
      : null,
    sentAt: m.sentAt ?? null,
    metadata,
    origin:
      evt.metadata && ("ad" in evt.metadata || "referral" in evt.metadata)
        ? { ad: evt.metadata["ad"] ?? null, referral: evt.metadata["referral"] ?? null }
        : null,
  };
}

export function deliveryStatus(eventName: string): "delivered" | "read" | "failed" | null {
  if (eventName === "message.delivered") return "delivered";
  if (eventName === "message.read" || eventName === "message.played") return "read";
  if (eventName === "message.failed") return "failed";
  return null;
}

export function failureText(evt: ZernioEvent): string | null {
  const e = evt.error;
  if (!e) return null;
  return [e.code ? `(${e.code})` : "", e.title ?? "", e.message ?? ""].join(" ").trim() || null;
}

// ------------------------------------------------------------------ ligações

export interface CallOutcome {
  status: CallStatus;
  reason: string;
  answered: boolean;
}

export function callOutcome(eventName: string, call: ZernioCall): CallOutcome {
  const inbound = call.direction !== "outbound";
  if (eventName === "call.failed")
    return {
      status: "failed",
      reason: call.error?.message ? `Falhou: ${call.error.message}` : "Falhou na operadora",
      answered: false,
    };
  if (call.isVoicemail) return { status: "voicemail", reason: "Caixa postal", answered: false };
  const secs = call.durationSeconds ?? 0;
  switch (call.endReason) {
    case "hangup":
      return secs > 0
        ? { status: "completed", reason: "Atendida", answered: true }
        : {
            status: inbound ? "missed" : "canceled",
            reason: "Desligada antes de atender",
            answered: false,
          };
    case "no_answer":
      return {
        status: inbound ? "missed" : "no_answer",
        reason: "Ninguém atendeu",
        answered: false,
      };
    case "rejected":
      return call.sipHangupCause === "486"
        ? { status: "busy", reason: "Ocupado", answered: false }
        : { status: inbound ? "missed" : "no_answer", reason: "Recusada", answered: false };
    case "error":
      return { status: "failed", reason: "Erro na ligação", answered: false };
    default:
      return secs > 0
        ? { status: "completed", reason: "Atendida", answered: true }
        : { status: inbound ? "missed" : "no_answer", reason: "Encerrada", answered: false };
  }
}

/** Custo total da ligação em US$: perna da Zernio + gravação + minuto da Meta (pago à Meta). */
export function callCostUsd(call: ZernioCall): number | null {
  const b = call.billing;
  if (!b) return null;
  if (typeof b.totalCostUSD === "number") return b.totalCostUSD;
  const parts = [b.billableCostUSD, b.metaCostUSD].filter(
    (v): v is number => typeof v === "number",
  );
  return parts.length ? parts.reduce((a, v) => a + v, 0) : null;
}

export function callNumbers(call: ZernioCall): { from: string | null; to: string | null } {
  return { from: toE164(call.from) ?? call.from ?? null, to: toE164(call.to) ?? call.to ?? null };
}

/** WhatsApp chama pelo número conectado; a perna de telefone tem phoneNumberId da Zernio. */
export function callChannel(
  call: ZernioCall,
  accountPlatform: string | undefined,
): "whatsapp" | "pstn" {
  return call.metaCallId || accountPlatform === "whatsapp" ? "whatsapp" : "pstn";
}

// ------------------------------------------------------------------ números

const NUMBER_STATUS: Record<string, string> = {
  "whatsapp.number.kyc_submitted": "pending_regulatory",
  "whatsapp.number.activated": "active",
  "whatsapp.number.declined": "regulatory_declined",
  "whatsapp.number.suspended": "suspended",
  "whatsapp.number.reactivated": "active",
  "whatsapp.number.released": "released",
};

/** Status novo do número; `null` quando o evento não muda o status (pedido de informação). */
export function numberStatusFor(eventName: string): string | null {
  return NUMBER_STATUS[eventName] ?? null;
}

export function numberReason(evt: ZernioEvent): string | null {
  switch (evt.event) {
    case "whatsapp.number.action_required":
      return "A operadora pediu mais informações. Abra o número para responder.";
    case "whatsapp.number.verification_required":
      return "Falta a verificação de identidade do responsável.";
    case "whatsapp.number.declined":
      return evt.reason ?? "O cadastro foi recusado na análise.";
    case "whatsapp.number.suspended":
      return evt.reason === "payment_failed"
        ? "Pagamento recusado na Zernio. Atualize o cartão."
        : (evt.reason ?? "Número suspenso.");
    case "whatsapp.number.released":
      return evt.reason ?? "Número liberado.";
    default:
      return null;
  }
}
