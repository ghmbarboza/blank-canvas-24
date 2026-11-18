// Envio de texto/template do servidor para o canal de uma conversa (agente de IA, CSAT, SAC).
// Porte enxuto do edge send-message: grava a mensagem como "queued", envia e marca o resultado.
import { randomUUID } from "node:crypto";

import { admin } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";
import { isOfficialWhatsApp } from "@/features/channels/zernio-rules";

const GRAPH = `https://graph.facebook.com/${process.env["META_GRAPH_VERSION"] ?? "v26.0"}`;
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface ChannelRow {
  id: string;
  provider: string;
  platform: string;
  external_id: string;
  config: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  externalId: string | null;
}

async function secret(scope: "integration" | "channel", scopeId: string, key: string) {
  const { data } = await admin().rpc("secret_get", {
    _scope: scope,
    _scope_id: scopeId,
    _key: key,
  });
  return typeof data === "string" && data ? data : null;
}

// guarded: URL que vem do cadastro do admin (Evolution) passa pelo publicFetch (R8)
async function jsonFetch<T>(
  url: string,
  init: Omit<RequestInit, "redirect">,
  guarded = false,
): Promise<T> {
  const req = { ...init, signal: AbortSignal.timeout(15_000) };
  const res = guarded ? await publicFetch(url, req, { httpsOnly: true }) : await fetch(url, req);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok)
    throw new Error(`${new URL(url).host} ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as T;
}

async function dispatch(
  accountId: string,
  ch: ChannelRow,
  to: string,
  p: {
    text: string;
    template?: { name: string; language: string; params?: string[] } | null;
    outsideWindow: boolean;
    conversationId: string;
    lastInboundAt: string | null;
    contactId: string | null;
  },
): Promise<string | null> {
  if (ch.provider === "whatsapp_cloud") {
    const token = await secret("channel", ch.id, "access_token");
    if (!token) throw new Error("Token da Meta ausente");
    const body = p.template
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: p.template.name,
            language: { code: p.template.language },
            components: p.template.params?.length
              ? [
                  {
                    type: "body",
                    parameters: p.template.params.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: p.text, preview_url: true },
        };
    const r = await jsonFetch<{ messages?: { id: string }[] }>(
      `${GRAPH}/${ch.external_id}/messages`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return r.messages?.[0]?.id ?? null;
  }
  if (ch.provider === "evolution") {
    const apiKey = await secret("integration", accountId, "evolution_api_key");
    const { data: integ } = await admin()
      .from("account_integrations")
      .select("config")
      .eq("account_id", accountId)
      .eq("provider", "evolution")
      .maybeSingle();
    const baseUrl = (integ?.config as { base_url?: string } | null)?.base_url;
    if (!apiKey || !baseUrl) throw new Error("Evolution não configurada");
    const r = await jsonFetch<{ key?: { id?: string } }>(
      `${baseUrl.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(ch.external_id)}`,
      {
        method: "POST",
        headers: { apikey: apiKey, "content-type": "application/json" },
        body: JSON.stringify({ number: to, text: p.text }),
      },
      true,
    );
    return r.key?.id ?? null;
  }
  if (ch.provider === "zernio" && ch.platform === "whatsapp") {
    const { dispatchZernioWhatsApp } = await import("@/backend/providers/zernio-send.server");
    return dispatchZernioWhatsApp(
      accountId,
      ch.external_id,
      {
        id: p.conversationId,
        external_thread_id: to,
        last_inbound_at: p.lastInboundAt,
        contact_id: p.contactId,
      },
      p.template ? { template: p.template } : { text: p.text },
    );
  }
  if (ch.provider === "zernio") {
    const apiKey = await secret("integration", accountId, "zernio_api_key");
    if (!apiKey) throw new Error("Zernio não configurada");
    const body: Record<string, unknown> = { accountId: ch.external_id, message: p.text };
    if (p.outsideWindow && ["instagram", "facebook"].includes(ch.platform)) {
      body["messagingType"] = "MESSAGE_TAG";
      body["messageTag"] = "HUMAN_AGENT";
    }
    const r = await jsonFetch<{ data?: { messageId?: string } }>(
      `https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(to)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(body),
      },
    );
    return r.data?.messageId ?? null;
  }
  if (ch.provider === "zadarma" && ch.platform === "sms") {
    const { sendZadarmaSms } = await import("@/backend/providers/zadarma-sms.server");
    return sendZadarmaSms(accountId, ch, to, p.text, p.contactId);
  }
  if (ch.platform === "sms")
    throw new Error("Este canal de SMS saiu da Central de CS. Conecte o SMS pela Zadarma em Canais.");
  throw new Error(`O canal ${ch.provider} ainda não envia pelo servidor`);
}

// Envia na conversa como IA ou sistema. Fora da janela de 24 h do WhatsApp oficial, só com template.
export async function sendToConversation(
  conversationId: string,
  p: {
    text: string;
    senderType: "ai" | "system" | "user";
    /** quem da equipe mandou, quando senderType = "user" */
    senderUserId?: string | null;
    template?: { name: string; language: string; params?: string[] } | null;
    metadata?: Record<string, unknown>;
  },
): Promise<SendResult> {
  const db = admin();
  const { data: conv } = await db
    .from("conversations")
    .select(
      "id, account_id, contact_id, external_thread_id, last_inbound_at, channels(id, provider, platform, external_id, config)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) throw new Error("Conversa não encontrada");
  const ch = conv.channels as unknown as ChannelRow | null;
  if (!ch) throw new Error("O canal desta conversa foi removido");
  const outsideWindow =
    !conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > WINDOW_MS;
  if (isOfficialWhatsApp(ch) && outsideWindow && !p.template) {
    throw new Error("Fora da janela de 24 h: precisa de template aprovado");
  }
  const { data: row, error } = await db
    .from("messages")
    .insert({
      account_id: conv.account_id,
      conversation_id: conv.id,
      direction: "out",
      sender_type: p.senderType,
      sender_user_id: p.senderType === "user" ? (p.senderUserId ?? null) : null,
      sender_name:
        p.senderType === "ai" ? "Assistente" : p.senderType === "system" ? "Sistema" : null,
      type: p.template ? "template" : "text",
      body: p.template ? `[template] ${p.template.name}` : p.text,
      status: "queued",
      metadata: (p.metadata ?? {}) as never,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`Falha ao registrar a mensagem: ${error?.message}`);
  try {
    const externalId = await dispatch(conv.account_id, ch, conv.external_thread_id, {
      text: p.text,
      template: p.template ?? null,
      outsideWindow,
      conversationId: conv.id,
      lastInboundAt: conv.last_inbound_at,
      contactId: conv.contact_id,
    });
    await db.from("messages").update({ status: "sent", external_id: externalId }).eq("id", row.id);
    return { messageId: row.id, externalId };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err).slice(0, 400);
    await db.from("messages").update({ status: "failed", error: msg }).eq("id", row.id);
    throw err;
  }
}

export async function listMetaTemplates(accountId: string, channelId: string) {
  const { data: ch } = await admin()
    .from("channels")
    .select("id, provider, config")
    .eq("id", channelId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!ch || ch.provider !== "whatsapp_cloud") return [];
  const token = await secret("channel", ch.id, "access_token");
  const waba = (ch.config as { waba_id?: string } | null)?.waba_id;
  if (!token || !waba) throw new Error("Canal sem token ou WABA configurado");
  const r = await jsonFetch<{
    data?: {
      name: string;
      language: string;
      status: string;
      category: string;
      components?: { type: string; text?: string }[];
    }[];
  }>(
    `${GRAPH}/${waba}/message_templates?fields=name,language,status,category,components&limit=200`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  return (r.data ?? []).filter((t) => t.status === "APPROVED");
}
