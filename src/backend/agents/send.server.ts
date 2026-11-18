// Envio com ritmo de gente (§3-bis): "digitando" quando o canal deixa, atraso proporcional,
// mensagem quebrada em partes curtas e nota de voz na voz da casa (ElevenLabs) quando o cliente
// mandou áudio. E-mail não se quebra: sai inteiro, pelo Gmail/Outlook (Composio) ou pelo e-mail da conta.
import { randomUUID } from "node:crypto";

import { admin } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";
import { sendToConversation } from "@/backend/support/channel-send.server";
import type { AgentStyle } from "@/features/agents/catalog";

import { splitMessage, typingDelayMs } from "./humanize";

const GRAPH = `https://graph.facebook.com/${process.env["META_GRAPH_VERSION"] ?? "v26.0"}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ConvChannel {
  conversationId: string;
  accountId: string;
  threadId: string;
  contactId: string | null;
  channel: {
    id: string;
    provider: string;
    platform: string;
    external_id: string;
    config: Record<string, unknown>;
  };
}

async function secret(scope: "integration" | "channel", scopeId: string, key: string) {
  const { data } = await admin().rpc("secret_get", {
    _scope: scope,
    _scope_id: scopeId,
    _key: key,
  });
  return typeof data === "string" && data ? data : null;
}

async function load(conversationId: string): Promise<ConvChannel> {
  const { data: conv } = await admin()
    .from("conversations")
    .select(
      "id, account_id, external_thread_id, contact_id, channels(id, provider, platform, external_id, config)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  const ch = conv?.channels as unknown as ConvChannel["channel"] | null;
  if (!conv || !ch) throw new Error("Conversa ou canal não encontrado");
  return {
    conversationId: conv.id,
    accountId: conv.account_id,
    threadId: conv.external_thread_id,
    contactId: conv.contact_id,
    channel: { ...ch, config: (ch.config ?? {}) as Record<string, unknown> },
  };
}

async function evolutionBase(accountId: string): Promise<{ url: string; key: string } | null> {
  const key = await secret("integration", accountId, "evolution_api_key");
  const { data } = await admin()
    .from("account_integrations")
    .select("config")
    .eq("account_id", accountId)
    .eq("provider", "evolution")
    .maybeSingle();
  const url = (data?.config as { base_url?: string } | null)?.base_url;
  return key && url ? { url: url.replace(/\/+$/, ""), key } : null;
}

/** "Digitando": WhatsApp oficial (com a última mensagem recebida) e Evolution. Falha não impede o envio. */
async function showTyping(c: ConvChannel, inboundExternalId: string | null, ms: number) {
  try {
    if (c.channel.provider === "whatsapp_cloud" && inboundExternalId) {
      const token = await secret("channel", c.channel.id, "access_token");
      if (!token) return;
      await fetch(`${GRAPH}/${c.channel.external_id}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: inboundExternalId,
          typing_indicator: { type: "text" },
        }),
        signal: AbortSignal.timeout(8000),
      });
    } else if (c.channel.provider === "webchat") {
      // o widget do site lê isto no poll e mostra "digitando…"
      await admin()
        .from("agent_conversation_state")
        .upsert(
          {
            conversation_id: c.conversationId,
            account_id: c.accountId,
            typing_until: new Date(Date.now() + ms + 1500).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "conversation_id" },
        );
    } else if (c.channel.provider === "evolution") {
      const evo = await evolutionBase(c.accountId);
      if (!evo) return;
      // base_url é do admin (e leva a apikey): só https público, sem redirecionamento (R8)
      await publicFetch(
        `${evo.url}/chat/sendPresence/${encodeURIComponent(c.channel.external_id)}`,
        {
          method: "POST",
          headers: { apikey: evo.key, "content-type": "application/json" },
          body: JSON.stringify({
            number: c.threadId,
            presence: "composing",
            delay: Math.min(ms, 15000),
          }),
          signal: AbortSignal.timeout(8000),
        },
        { httpsOnly: true },
      );
    }
  } catch (err) {
    console.error("[agentes] digitando", err instanceof Error ? err.message : err);
  }
}

/** Chat do site não tem provedor: a mensagem gravada já é a entrega (o visitante busca no poll). */
async function webchatInsert(c: ConvChannel, text: string, metadata: Record<string, unknown>) {
  const db = admin();
  const { data, error } = await db
    .from("messages")
    .insert({
      account_id: c.accountId,
      conversation_id: c.conversationId,
      direction: "out",
      sender_type: "ai",
      sender_name: "Assistente",
      type: "text",
      body: text,
      status: "sent",
      metadata: metadata as never,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`chat do site: ${error?.message}`);
  await db
    .from("agent_conversation_state")
    .update({ typing_until: null })
    .eq("conversation_id", c.conversationId);
  return data.id;
}

// ───────────────────────── voz da casa ─────────────────────────
export async function synthesizeVoice(
  accountId: string,
  voiceId: string,
  text: string,
): Promise<Buffer> {
  const { getIntegration } = await import("@/backend/integrations.server");
  const it = await getIntegration(accountId, "elevenlabs");
  const key = it?.secrets["api_key"];
  if (!key) throw new Error("ElevenLabs não configurada");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=opus_48000_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 1200), model_id: "eleven_flash_v2_5" }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await admin()
    .from("usage_ledger")
    .insert({
      account_id: accountId,
      kind: "other",
      quantity: text.length,
      unit: "chars",
      cost_usd: (text.length / 1000) * 0.05,
      meta: { purpose: "agent_voice_note", voice_id: voiceId },
    });
  return buf;
}

async function sendVoiceNote(
  c: ConvChannel,
  text: string,
  voiceId: string,
  metadata: Record<string, unknown>,
) {
  const audio = await synthesizeVoice(c.accountId, voiceId, text);
  const db = admin();
  const path = `${c.accountId}/${c.conversationId}/ia-voz-${randomUUID()}.ogg`;
  const up = await db.storage
    .from("media")
    .upload(path, audio, { contentType: "audio/ogg", upsert: false });
  if (up.error) throw new Error(`áudio: ${up.error.message}`);
  const { data: signed } = await db.storage.from("media").createSignedUrl(path, 3600);
  if (!signed?.signedUrl) throw new Error("áudio sem link");
  let externalId: string | null = null;
  if (c.channel.provider === "whatsapp_cloud") {
    const token = await secret("channel", c.channel.id, "access_token");
    if (!token) throw new Error("Token da Meta ausente");
    const res = await fetch(`${GRAPH}/${c.channel.external_id}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: c.threadId,
        type: "audio",
        audio: { link: signed.signedUrl },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[] };
    if (!res.ok) throw new Error(`Meta ${res.status}`);
    externalId = j.messages?.[0]?.id ?? null;
  } else if (c.channel.provider === "evolution") {
    const evo = await evolutionBase(c.accountId);
    if (!evo) throw new Error("Evolution não configurada");
    const res = await publicFetch(
      `${evo.url}/message/sendWhatsAppAudio/${encodeURIComponent(c.channel.external_id)}`,
      {
        method: "POST",
        headers: { apikey: evo.key, "content-type": "application/json" },
        body: JSON.stringify({ number: c.threadId, audio: audio.toString("base64") }),
        signal: AbortSignal.timeout(30_000),
      },
      { httpsOnly: true },
    );
    const j = (await res.json().catch(() => ({}))) as { key?: { id?: string } };
    if (!res.ok) throw new Error(`Evolution ${res.status}`);
    externalId = j.key?.id ?? null;
  } else throw new Error("canal sem nota de voz");
  const { data: row } = await db
    .from("messages")
    .insert({
      account_id: c.accountId,
      conversation_id: c.conversationId,
      direction: "out",
      sender_type: "ai",
      sender_name: "Assistente",
      type: "audio",
      body: null,
      transcript: text,
      media_url: path,
      media_mime: "audio/ogg",
      status: "sent",
      external_id: externalId,
      metadata: metadata as never,
    } as never)
    .select("id")
    .single();
  return (row as { id: string } | null)?.id ?? null;
}

// ───────────────────────── e-mail ─────────────────────────
async function sendEmail(
  c: ConvChannel,
  text: string,
  metadata: Record<string, unknown>,
): Promise<string | null> {
  const db = admin();
  const { data: lastIn } = await db
    .from("messages")
    .select("metadata")
    .eq("conversation_id", c.conversationId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mail =
    (
      (lastIn?.metadata ?? {}) as {
        email?: { subject?: string; thread_id?: string; message_id?: string };
      }
    ).email ?? {};
  const subject = mail.subject
    ? mail.subject.startsWith("Re:")
      ? mail.subject
      : `Re: ${mail.subject}`
    : "Re: seu contato";
  const via =
    c.channel.config["via"] === "composio" ? String(c.channel.config["toolkit"] ?? "") : "";
  const { data: row, error } = await db
    .from("messages")
    .insert({
      account_id: c.accountId,
      conversation_id: c.conversationId,
      direction: "out",
      sender_type: "ai",
      sender_name: "Assistente",
      type: "text",
      body: text,
      status: "queued",
      metadata: { ...metadata, email: { subject } } as never,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`mensagem: ${error?.message}`);
  try {
    if (via === "gmail" || via === "outlook") {
      const { sendMailViaComposio } = await import("./composio.server");
      await sendMailViaComposio(c.accountId, via, {
        to: c.threadId,
        subject,
        text,
        threadId: mail.thread_id ?? null,
        messageId: mail.message_id ?? null,
      });
    } else {
      await db.rpc("enqueue_job", {
        _account: c.accountId,
        _kind: "email.send",
        _payload: {
          to_email: c.threadId,
          to_contact_id: c.contactId,
          subject,
          html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>")}</div>`,
          text,
          category: "transactional",
        } as never,
      });
    }
    await db.from("messages").update({ status: "sent" }).eq("id", row.id);
    return row.id;
  } catch (err) {
    await db
      .from("messages")
      .update({
        status: "failed",
        error: String(err instanceof Error ? err.message : err).slice(0, 400),
      })
      .eq("id", row.id);
    throw err;
  }
}

export interface SendOptions {
  style: AgentStyle;
  /** Responder em nota de voz (o orquestrador decide pela regra do agente e pelo último áudio). */
  voiceId: string | null;
  inboundExternalId: string | null;
  metadata: Record<string, unknown>;
}

/** Manda a resposta como gente. Devolve o id da primeira mensagem gravada. */
export async function sendHumanized(
  conversationId: string,
  text: string,
  o: SendOptions,
): Promise<string | null> {
  const c = await load(conversationId);
  if (c.channel.provider === "email" || c.channel.platform === "email")
    return sendEmail(c, text, o.metadata);
  if (o.voiceId && ["whatsapp_cloud", "evolution"].includes(c.channel.provider)) {
    try {
      if (o.style.typing) await showTyping(c, o.inboundExternalId, 3000);
      return await sendVoiceNote(c, text, o.voiceId, { ...o.metadata, voice_note: true });
    } catch (err) {
      console.error(
        "[agentes] nota de voz falhou, vai por texto",
        err instanceof Error ? err.message : err,
      );
    }
  }
  const parts = o.style.split ? splitMessage(text, o.style.max_part_chars) : [text.trim()];
  let first: string | null = null;
  for (const [i, part] of parts.entries()) {
    const wait = typingDelayMs(part, o.style);
    if (o.style.typing && wait > 0) await showTyping(c, o.inboundExternalId, wait);
    if (wait > 0 && (i > 0 || o.style.typing)) await sleep(wait);
    const meta = { ...o.metadata, part: i + 1, parts: parts.length };
    const sentId =
      c.channel.provider === "webchat"
        ? await webchatInsert(c, part, meta)
        : (
            await sendToConversation(conversationId, {
              text: part,
              senderType: "ai",
              metadata: meta,
            })
          ).messageId;
    first ??= sentId;
  }
  return first;
}
