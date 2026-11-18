// Chat do site: sessão anônima por token (o navegador guarda o token; o banco guarda o hash).
import { createHash, randomBytes } from "node:crypto";

import { HttpError, admin } from "@/backend/http.server";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function webchatChannel(channelId: string) {
  const { data } = await admin()
    .from("channels")
    .select("id, account_id, provider, status, name, config, owner_user_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!data || data.provider !== "webchat" || data.status !== "connected")
    throw new HttpError(404, "Chat indisponível", "not_found");
  return data;
}

export async function startSession(
  channelId: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    visitorId?: string | null;
    pageUrl?: string | null;
  },
) {
  const db = admin();
  const ch = await webchatChannel(channelId);
  const name = input.name?.trim().slice(0, 120) || "Visitante do site";
  const email = input.email?.trim().toLowerCase().slice(0, 200) || null;
  const phone = input.phone?.replace(/\D/g, "").slice(0, 20) || null;
  // Nunca reaproveita contato pelo e-mail digitado: quem digita não provou que é o dono dele, e a
  // IA usaria a ficha (histórico, negócios) do cliente verdadeiro para responder a um estranho.
  // O contato novo guarda o e-mail; juntar com o existente é decisão do atendente (mesclar).
  let contactId: string | null = null;
  if (!contactId) {
    const { data, error } = await db
      .from("contacts")
      .insert({
        account_id: ch.account_id,
        name,
        email,
        phone,
        source: "webchat",
        lifecycle: "lead",
        owner_user_id: ch.owner_user_id,
        first_touch: {
          source: "site",
          medium: "chat",
          channel: "webchat",
          at: new Date().toISOString(),
        },
        last_touch: {
          source: "site",
          medium: "chat",
          channel: "webchat",
          at: new Date().toISOString(),
        },
      } as never)
      .select("id")
      .single();
    if (error) throw new HttpError(500, "Não deu para iniciar o chat", "contact");
    contactId = data.id;
  }
  const thread = `web-${randomBytes(9).toString("hex")}`;
  const { data: conv, error: convErr } = await db
    .from("conversations")
    .insert({
      account_id: ch.account_id,
      channel_id: ch.id,
      contact_id: contactId,
      external_thread_id: thread,
      title: name,
      status: "open",
      ai_enabled: (ch.config as Record<string, unknown> | null)?.["ai"] === true,
    })
    .select("id")
    .single();
  if (convErr) throw new HttpError(500, "Não deu para iniciar o chat", "conversation");
  const token = randomBytes(24).toString("hex");
  await db.from("webchat_sessions").insert({
    account_id: ch.account_id,
    channel_id: ch.id,
    conversation_id: conv.id,
    contact_id: contactId,
    token_hash: hashToken(token),
    visitor_id: input.visitorId ?? null,
  });
  await db.from("form_submissions").insert({
    account_id: ch.account_id,
    contact_id: contactId,
    source: "webchat",
    page_url: input.pageUrl?.slice(0, 500) ?? null,
    payload: { name, email, phone },
  });
  if (input.visitorId)
    await db
      .from("page_visits")
      .update({ contact_id: contactId })
      .eq("account_id", ch.account_id)
      .eq("visitor_id", input.visitorId)
      .is("contact_id", null);
  return { token, accountId: ch.account_id };
}

export async function sessionFromToken(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token))
    throw new HttpError(401, "Sessão do chat inválida", "bad_token");
  const { data } = await admin()
    .from("webchat_sessions")
    .select("*")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) throw new HttpError(401, "Sessão do chat expirou", "bad_token");
  return data;
}

export async function visitorSend(token: unknown, text: unknown) {
  const s = await sessionFromToken(token);
  const body = typeof text === "string" ? text.trim().slice(0, 2000) : "";
  if (!body) throw new HttpError(400, "Mensagem vazia", "empty");
  const db = admin();
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", s.conversation_id)
    .eq("direction", "in")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) > 20)
    throw new HttpError(429, "Calma! Muitas mensagens seguidas.", "rate_limited");
  const { data, error } = await db
    .from("messages")
    .insert({
      account_id: s.account_id,
      conversation_id: s.conversation_id,
      direction: "in",
      sender_type: "contact",
      type: "text",
      body,
      status: "received",
    })
    .select("id, created_at")
    .single();
  if (error) throw new HttpError(500, "Não deu para enviar", "send");
  await db
    .from("webchat_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", s.id);
  return data;
}

export async function visitorPoll(token: unknown, after: unknown) {
  const s = await sessionFromToken(token);
  const db = admin();
  let q = db
    .from("messages")
    .select("id, direction, body, created_at, sender_type, type")
    .eq("conversation_id", s.conversation_id)
    .eq("is_private", false)
    .order("created_at")
    .limit(100);
  if (typeof after === "string" && !Number.isNaN(Date.parse(after))) q = q.gt("created_at", after);
  const { data } = await q;
  await db
    .from("webchat_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", s.id);
  return (data ?? [])
    .filter((m) => m.type === "text" || m.type === "template")
    .map((m) => ({
      id: m.id,
      from: m.direction === "in" ? "visitor" : m.sender_type === "ai" ? "ai" : "agent",
      body: m.body,
      at: m.created_at,
    }));
}

/** A IA está escrevendo agora nesta conversa? (o widget mostra "digitando…") */
export async function visitorTyping(token: unknown): Promise<boolean> {
  const s = await sessionFromToken(token);
  const { data } = await admin()
    .from("agent_conversation_state")
    .select("typing_until")
    .eq("conversation_id", s.conversation_id)
    .maybeSingle();
  return !!data?.typing_until && new Date(data.typing_until).getTime() > Date.now();
}
