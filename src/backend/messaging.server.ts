// Envio de mensagens pelo servidor (automações, IA, webchat). Porte para Node do envio que a
// edge function send-message faz: Meta Cloud, Evolution e Zernio. Antes de enviar confere
// supressão, consentimento de marketing, janela de 24 h e horário silencioso da conta.
import { randomUUID } from "node:crypto";

import { admin } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";
import { inQuietHours, quietHoursEnd } from "@/features/automations/engine";
import { isOfficialWhatsApp } from "@/features/channels/zernio-rules";

const GRAPH = `https://graph.facebook.com/${process.env["META_GRAPH_VERSION"] ?? "v26.0"}`;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SendResult {
  status: "sent" | "skipped" | "deferred";
  reason?: string;
  messageId?: string;
  deferUntil?: string;
}

interface ChannelLite {
  id: string;
  provider: string;
  platform: string;
  external_id: string | null;
  status: string;
}

async function secret(
  scope: "integration" | "channel",
  scopeId: string,
  key: string,
): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: scope,
    _scope_id: scopeId,
    _key: key,
  });
  return typeof data === "string" && data ? data : null;
}

async function metaPost(
  token: string,
  phoneNumberId: string,
  body: unknown,
): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  } | null;
  if (!res.ok)
    throw new Error(
      `Meta ${res.status}: ${data?.error?.message ?? "erro"} (${data?.error?.code ?? "-"})`,
    );
  return data?.messages?.[0]?.id ?? null;
}

async function evolutionPost(
  accountId: string,
  instance: string,
  path: string,
  body: unknown,
): Promise<string | null> {
  const apiKey = await secret("integration", accountId, "evolution_api_key");
  const { data: integ } = await admin()
    .from("account_integrations")
    .select("config")
    .eq("account_id", accountId)
    .eq("provider", "evolution")
    .maybeSingle();
  const baseUrl = (integ?.config as { base_url?: string } | null)?.base_url;
  if (!apiKey || !baseUrl) throw new Error("Evolution não configurada");
  // base_url é do admin (e leva a apikey): só https público, sem redirecionamento (R8)
  const res = await publicFetch(
    `${baseUrl.replace(/\/+$/, "")}${path}/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
    { httpsOnly: true },
  );
  const data = (await res.json().catch(() => null)) as {
    key?: { id?: string };
    message?: unknown;
  } | null;
  if (!res.ok)
    throw new Error(
      `Evolution ${res.status}: ${JSON.stringify(data?.message ?? "").slice(0, 200)}`,
    );
  return data?.key?.id ?? null;
}

async function zernioPost(
  accountId: string,
  conversationId: string,
  zernioAccountId: string,
  text: string,
  humanAgent: boolean,
): Promise<string | null> {
  const apiKey = await secret("integration", accountId, "zernio_api_key");
  if (!apiKey) throw new Error("Zernio não configurada");
  const body: Record<string, unknown> = { accountId: zernioAccountId, message: text };
  if (humanAgent) {
    body["messagingType"] = "MESSAGE_TAG";
    body["messageTag"] = "HUMAN_AGENT";
  }
  const res = await fetch(
    `https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const data = (await res.json().catch(() => null)) as {
    data?: { messageId?: string };
    error?: string;
  } | null;
  if (!res.ok) throw new Error(`Zernio ${res.status}: ${data?.error ?? "erro"}`);
  return data?.data?.messageId ?? null;
}

export interface WhatsAppInput {
  accountId: string;
  contactId: string;
  text?: string | null;
  template?: { name: string; language: string; params?: string[] } | null;
  category: "service" | "marketing" | "utility";
  senderType?: "ai" | "system" | "user";
  senderUserId?: string | null;
  /** Ignora o horário silencioso (resposta a quem acabou de escrever). */
  ignoreQuietHours?: boolean;
  /** Força este canal de WhatsApp (campanha: o template só existe no canal escolhido). */
  channelId?: string | null;
}

/** WhatsApp para um contato: acha (ou cria) a conversa no canal de WhatsApp e envia. */
export async function sendWhatsApp(input: WhatsAppInput): Promise<SendResult> {
  const db = admin();
  const { data: contact } = await db
    .from("contacts")
    .select("id, account_id, phone, name")
    .eq("id", input.contactId)
    .eq("account_id", input.accountId)
    .maybeSingle();
  if (!contact) return { status: "skipped", reason: "Contato não encontrado" };
  const phone = (contact.phone ?? "").replace(/\D/g, "");

  const { data: allowed } = await db.rpc("can_contact", {
    _contact: contact.id,
    _channel: "whatsapp",
  });
  if (allowed === false)
    return { status: "skipped", reason: "Contato bloqueado ou sem telefone para WhatsApp" };

  const { data: account } = await db
    .from("accounts")
    .select("timezone, settings")
    .eq("id", input.accountId)
    .single();
  const privacy = ((account?.settings as Record<string, unknown> | null)?.["privacy"] ??
    {}) as Record<string, unknown>;
  const tz = account?.timezone || "America/Sao_Paulo";

  if (input.category === "marketing" && privacy["whatsapp_marketing_requires_consent"] !== false) {
    const { data: st } = await db
      .from("contact_consent_state")
      .select("status")
      .eq("contact_id", contact.id)
      .eq("channel", "whatsapp")
      .maybeSingle();
    if (st?.status !== "granted")
      return {
        status: "skipped",
        reason: "Sem consentimento registrado para marketing no WhatsApp",
      };
  }

  if (!input.ignoreQuietHours) {
    const qs =
      typeof privacy["quiet_hours_start"] === "string"
        ? (privacy["quiet_hours_start"] as string)
        : "21:00";
    const qe =
      typeof privacy["quiet_hours_end"] === "string"
        ? (privacy["quiet_hours_end"] as string)
        : "08:00";
    const now = new Date();
    if (inQuietHours(now, tz, qs, qe))
      return {
        status: "deferred",
        reason: "Horário silencioso",
        deferUntil: quietHoursEnd(now, tz, qs, qe).toISOString(),
      };
  }

  // Conversa existente num canal de WhatsApp; senão o primeiro canal conectado (preferindo o oficial).
  const { data: convs } = await db
    .from("conversations")
    .select(
      "id, external_thread_id, last_inbound_at, channel_id, channels!inner(id, provider, platform, external_id, status)",
    )
    .eq("contact_id", contact.id)
    .eq("is_group", false)
    .eq("channels.platform", "whatsapp")
    .match(input.channelId ? { channel_id: input.channelId } : {})
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1);
  type Conv = {
    id: string;
    external_thread_id: string;
    last_inbound_at: string | null;
    channel_id: string | null;
    channels: ChannelLite;
  };
  let found = convs?.[0] as unknown as Conv | undefined;
  if (!found) {
    if (!phone) return { status: "skipped", reason: "Contato sem telefone" };
    const { data: chans } = await db
      .from("channels")
      .select("id, provider, platform, external_id, status")
      .eq("account_id", input.accountId)
      .eq("platform", "whatsapp")
      .eq("status", "connected")
      .match(input.channelId ? { id: input.channelId } : {});
    // Zernio é o padrão (plano v2, §3-ter); Meta direta e Evolution são legado.
    const rank = (p: string) => (p === "zernio" ? 0 : p === "whatsapp_cloud" ? 1 : 2);
    const channel = [...(chans ?? [])].sort((a, b) => rank(a.provider) - rank(b.provider))[0];
    if (!channel) return { status: "skipped", reason: "Nenhum WhatsApp conectado" };
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        account_id: input.accountId,
        channel_id: channel.id,
        contact_id: contact.id,
        external_thread_id: phone,
        title: contact.name,
        status: "open",
      })
      .select("id, external_thread_id, last_inbound_at, channel_id")
      .single();
    if (error) throw new Error(`Conversa: ${error.message}`);
    found = { ...created, channels: channel as ChannelLite };
  }
  const conv: Conv = found;
  const channel = conv.channels;
  const outside =
    !conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > WINDOW_MS;
  const text = input.text?.trim() ?? "";
  if (isOfficialWhatsApp(channel) && outside && !input.template)
    return {
      status: "skipped",
      reason: "Fora da janela de 24 h: este passo precisa de um template aprovado",
    };
  if (!text && !input.template) return { status: "skipped", reason: "Mensagem vazia" };

  const { data: pending, error: insErr } = await db
    .from("messages")
    .insert({
      account_id: input.accountId,
      conversation_id: conv.id,
      direction: "out",
      sender_type: input.senderType ?? "system",
      sender_user_id: input.senderUserId ?? null,
      type: input.template && (outside || !text) ? "template" : "text",
      body: input.template && (outside || !text) ? `[template] ${input.template.name}` : text,
      status: "queued",
      metadata: {
        origin: input.senderType === "ai" ? "ai" : "automation",
        category: input.category,
      },
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Mensagem: ${insErr.message}`);

  try {
    let externalId: string | null = null;
    if (channel.provider === "whatsapp_cloud") {
      const token = await secret("channel", channel.id, "access_token");
      if (!token || !channel.external_id) throw new Error("Token da Meta ausente");
      if (input.template && (outside || !text)) {
        const params = input.template.params ?? [];
        externalId = await metaPost(token, channel.external_id, {
          messaging_product: "whatsapp",
          to: conv.external_thread_id,
          type: "template",
          template: {
            name: input.template.name,
            language: { code: input.template.language },
            components: params.length
              ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }]
              : [],
          },
        });
      } else {
        externalId = await metaPost(token, channel.external_id, {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: conv.external_thread_id,
          type: "text",
          text: { body: text, preview_url: true },
        });
      }
    } else if (channel.provider === "evolution") {
      if (!channel.external_id) throw new Error("Instância da Evolution ausente");
      externalId = await evolutionPost(input.accountId, channel.external_id, "/message/sendText", {
        number: conv.external_thread_id,
        text: text || `[${input.template?.name}]`,
      });
    } else if (channel.provider === "zernio" && channel.platform === "whatsapp") {
      if (!channel.external_id) throw new Error("Conta da Zernio ausente");
      const { dispatchZernioWhatsApp } = await import("@/backend/providers/zernio-send.server");
      const useTemplate = Boolean(input.template && (outside || !text));
      externalId = await dispatchZernioWhatsApp(
        input.accountId,
        channel.external_id,
        {
          id: conv.id,
          external_thread_id: conv.external_thread_id,
          last_inbound_at: conv.last_inbound_at,
          contact_id: contact.id,
        },
        useTemplate ? { template: input.template ?? null } : { text },
      );
    } else if (channel.provider === "zernio") {
      if (!channel.external_id) throw new Error("Conta da Zernio ausente");
      externalId = await zernioPost(
        input.accountId,
        conv.external_thread_id,
        channel.external_id,
        text,
        outside,
      );
    } else {
      throw new Error(`Provedor ${channel.provider} não envia por aqui`);
    }
    await db
      .from("messages")
      .update({ status: "sent", external_id: externalId })
      .eq("id", pending.id);
    return { status: "sent", messageId: pending.id };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err).slice(0, 400);
    await db.from("messages").update({ status: "failed", error: msg }).eq("id", pending.id);
    throw err;
  }
}

/** Mensagem do atendente/IA numa conversa do chat do site: grava e o widget busca. */
export async function sendWebchatReply(
  accountId: string,
  conversationId: string,
  text: string,
  senderType: "user" | "ai" | "system",
  senderUserId: string | null,
) {
  const { data, error } = await admin()
    .from("messages")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      direction: "out",
      sender_type: senderType,
      sender_user_id: senderUserId,
      type: "text",
      body: text,
      status: "delivered",
    })
    .select("id, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
