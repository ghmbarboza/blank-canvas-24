// Evolution API v2 (WhatsApp via Baileys). Várias instâncias por conta; grupos suportados.
// Credenciais: integration:<account>:evolution_api_key (chave global) e config.base_url.
import type { NormalizedMessage } from "../ingest.ts";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
}

export const EVOLUTION_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
  "SEND_MESSAGE",
];

async function call<T>(
  cfg: EvolutionConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { apikey: cfg.apiKey, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data as { response?: { message?: unknown }; message?: unknown })?.response?.message ??
      (data as { message?: unknown })?.message ??
      text;
    const err = new Error(
      `Evolution ${res.status}: ${JSON.stringify(msg).slice(0, 300)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function createInstance(
  cfg: EvolutionConfig,
  instanceName: string,
  webhookUrl: string,
  webhookSecret: string,
) {
  try {
    await call(cfg, "POST", "/instance/create", {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
    });
  } catch (err) {
    // Já existe: segue e reaplica o webhook (idempotente).
    if ((err as { status?: number }).status !== 403 && (err as { status?: number }).status !== 409)
      throw err;
  }
  await setWebhook(cfg, instanceName, webhookUrl, webhookSecret);
}

export async function setWebhook(
  cfg: EvolutionConfig,
  instanceName: string,
  url: string,
  secret: string,
) {
  const webhook = {
    enabled: true,
    url,
    byEvents: false,
    base64: true,
    headers: { "x-webhook-secret": secret },
    events: EVOLUTION_EVENTS,
  };
  try {
    await call(cfg, "POST", `/webhook/set/${encodeURIComponent(instanceName)}`, { webhook });
  } catch {
    // Algumas versões aceitam só o corpo achatado.
    await call(cfg, "POST", `/webhook/set/${encodeURIComponent(instanceName)}`, {
      enabled: true,
      url,
      webhook_by_events: false,
      webhook_base64: true,
      events: EVOLUTION_EVENTS,
      headers: { "x-webhook-secret": secret },
    });
  }
}

export async function getQr(cfg: EvolutionConfig, instanceName: string) {
  const r = await call<{ base64?: string; code?: string; pairingCode?: string }>(
    cfg,
    "GET",
    `/instance/connect/${encodeURIComponent(instanceName)}`,
  );
  return { qr: r.base64 ?? null, pairingCode: r.pairingCode ?? null };
}

export async function getState(cfg: EvolutionConfig, instanceName: string) {
  const r = await call<{ instance?: { state?: string } }>(
    cfg,
    "GET",
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
  return r.instance?.state ?? "close";
}

export async function logout(cfg: EvolutionConfig, instanceName: string) {
  await call(cfg, "DELETE", `/instance/logout/${encodeURIComponent(instanceName)}`).catch(
    () => null,
  );
}

export async function deleteInstance(cfg: EvolutionConfig, instanceName: string) {
  await call(cfg, "DELETE", `/instance/delete/${encodeURIComponent(instanceName)}`).catch(
    () => null,
  );
}

export async function fetchGroups(cfg: EvolutionConfig, instanceName: string) {
  const r = await call<Array<{ id: string; subject?: string; size?: number; pictureUrl?: string }>>(
    cfg,
    "GET",
    `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
  );
  return Array.isArray(r) ? r : [];
}

export async function sendText(
  cfg: EvolutionConfig,
  instanceName: string,
  to: string,
  text: string,
) {
  const r = await call<{ key?: { id?: string } }>(
    cfg,
    "POST",
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      number: to,
      text,
    },
  );
  return r.key?.id ?? null;
}

export async function sendMedia(
  cfg: EvolutionConfig,
  instanceName: string,
  to: string,
  media: { url: string; mime: string; name?: string; caption?: string },
) {
  const kind = media.mime.startsWith("image/")
    ? "image"
    : media.mime.startsWith("video/")
      ? "video"
      : media.mime.startsWith("audio/")
        ? "audio"
        : "document";
  if (kind === "audio") {
    const r = await call<{ key?: { id?: string } }>(
      cfg,
      "POST",
      `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
      {
        number: to,
        audio: media.url,
      },
    );
    return r.key?.id ?? null;
  }
  const r = await call<{ key?: { id?: string } }>(
    cfg,
    "POST",
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    {
      number: to,
      mediatype: kind,
      media: media.url,
      mimetype: media.mime,
      caption: media.caption,
      fileName: media.name,
    },
  );
  return r.key?.id ?? null;
}

// ------------------------------------------------------------------ webhook → normalizado
interface EvoKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
  participant?: string;
  remoteJidAlt?: string;
}
interface EvoData {
  key?: EvoKey;
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number | string;
  senderPn?: string;
}

const MEDIA_KEYS: Array<[string, NormalizedMessage["type"]]> = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["audioMessage", "audio"],
  ["documentMessage", "document"],
  ["documentWithCaptionMessage", "document"],
  ["stickerMessage", "sticker"],
];

function digits(jid: string | undefined | null): string | null {
  if (!jid) return null;
  const base = jid.split("@")[0].split(":")[0];
  return /^\d{8,15}$/.test(base) ? base : null;
}

export function normalizeUpsert(data: EvoData, rootBase64?: string): NormalizedMessage | null {
  const key = data.key ?? {};
  const remote = key.remoteJid ?? "";
  if (!remote || remote === "status@broadcast" || !key.id) return null;
  const isGroup = remote.endsWith("@g.us");
  const msg = (data.message ?? {}) as Record<string, Record<string, unknown> | string | undefined>;

  // Autor: no grupo, participant; no 1:1, o próprio remoteJid (ou o telefone real se veio @lid).
  const authorJid = isGroup
    ? (key.participant ?? null)
    : (key.remoteJidAlt ?? data.senderPn ?? remote);
  const phone = digits(isGroup ? key.participant : (key.remoteJidAlt ?? data.senderPn ?? remote));

  let type: NormalizedMessage["type"] = "text";
  let body: string | null = null;
  let media: NormalizedMessage["media"] = null;
  if (typeof msg.conversation === "string") body = msg.conversation;
  const ext = msg.extendedTextMessage as
    { text?: string; contextInfo?: { stanzaId?: string } } | undefined;
  if (ext?.text) body = ext.text;
  for (const [k, t] of MEDIA_KEYS) {
    const m = msg[k] as
      | {
          caption?: string;
          mimetype?: string;
          fileName?: string;
          base64?: string;
          message?: {
            documentMessage?: { caption?: string; mimetype?: string; fileName?: string };
          };
        }
      | undefined;
    if (!m) continue;
    type = t;
    const inner = k === "documentWithCaptionMessage" ? m.message?.documentMessage : m;
    body = inner?.caption ?? body;
    const b64 = m.base64 ?? (typeof msg.base64 === "string" ? msg.base64 : undefined) ?? rootBase64;
    media = { base64: b64, mime: inner?.mimetype, name: inner?.fileName };
    if (!b64) media = null; // sem base64 a mídia fica só como texto do tipo
    break;
  }
  if (msg.reactionMessage) return null; // reações não viram mensagem na caixa
  if (msg.locationMessage) {
    type = "location";
    const l = msg.locationMessage as {
      degreesLatitude?: number;
      degreesLongitude?: number;
      name?: string;
    };
    body = l.name ?? `${l.degreesLatitude},${l.degreesLongitude}`;
  }
  if (!body && !media && type === "text") return null; // protocolo, edição, etc.

  const ts = Number(data.messageTimestamp);
  return {
    externalId: key.id,
    direction: key.fromMe ? "out" : "in",
    threadId: remote,
    isGroup,
    senderHandle: isGroup ? (phone ?? authorJid) : (phone ?? remote),
    senderName: key.fromMe ? null : (data.pushName ?? null),
    contactPhone: isGroup ? null : phone,
    type,
    body,
    media,
    replyToExternalId: ext?.contextInfo?.stanzaId ?? null,
    sentAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
  };
}

// Evolution usa valores numéricos ou textuais conforme a versão.
export function mapAckStatus(status: unknown): string | null {
  const s = String(status ?? "").toUpperCase();
  if (s === "SERVER_ACK" || s === "2") return "sent";
  if (s === "DELIVERY_ACK" || s === "3") return "delivered";
  if (s === "READ" || s === "PLAYED" || s === "4" || s === "5") return "read";
  if (s === "ERROR" || s === "0") return "failed";
  return null;
}
