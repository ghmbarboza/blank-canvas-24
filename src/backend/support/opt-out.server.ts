// Descadastro por palavra-chave (#67): o cliente escreve "SAIR" no WhatsApp ou SMS e deixa de
// receber divulgação naquele canal. Grava supressão + consentimento revogado (o can_contact já
// barra campanhas e automações), confirma ao cliente e deixa nota para a equipe. Idempotente.
import { admin } from "@/backend/http.server";

import { consentChannelFor, isOptOut, OPT_OUT_REPLY } from "./opt-out";

export async function handleOptOut(messageId: string): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: m } = await db
    .from("messages")
    .select(
      "id, account_id, conversation_id, direction, body, conversations(contact_id, channels(platform))",
    )
    .eq("id", messageId)
    .maybeSingle();
  if (!m || m.direction !== "in" || !isOptOut(m.body)) return { skipped: "não é descadastro" };
  const conv = m.conversations as unknown as {
    contact_id: string | null;
    channels: { platform: string } | null;
  } | null;
  const channel = consentChannelFor(conv?.channels?.platform ?? "");
  if (!channel || !conv?.contact_id) return { skipped: "canal sem descadastro" };
  const { data: contact } = await db
    .from("contacts")
    .select("phone")
    .eq("id", conv.contact_id)
    .maybeSingle();
  if (!contact?.phone) return { skipped: "contato sem telefone" };

  const { error: supErr, data: sup } = await db
    .from("suppressions")
    .upsert(
      {
        account_id: m.account_id,
        channel,
        address: contact.phone,
        reason: "unsubscribe",
        source: "palavra-chave",
      },
      { onConflict: "account_id,channel,address", ignoreDuplicates: true },
    )
    .select("id");
  if (supErr) throw new Error(`supressão: ${supErr.message}`);
  if (!sup?.length) return { skipped: "já estava descadastrado" };

  await db.from("consents").insert({
    account_id: m.account_id,
    contact_id: conv.contact_id,
    channel,
    status: "revoked",
    basis: "consent",
    source: "palavra-chave",
    proof: { message_id: m.id, text: m.body, at: new Date().toISOString() },
  });
  await db.from("messages").insert({
    account_id: m.account_id,
    conversation_id: m.conversation_id,
    direction: "out",
    sender_type: "system",
    sender_name: "Sistema",
    type: "note",
    is_private: true,
    body: `O cliente pediu para sair (“${m.body}”). Divulgação por ${channel === "sms" ? "SMS" : "WhatsApp"} bloqueada; o atendimento continua.`,
    status: "sent",
  });
  try {
    const { sendToConversation } = await import("./channel-send.server");
    await sendToConversation(m.conversation_id, {
      text: OPT_OUT_REPLY,
      senderType: "system",
      metadata: { opt_out: true },
    });
  } catch (err) {
    // a confirmação é cortesia; o descadastro já está gravado
    console.warn("[descadastro] confirmação não enviada", String(err));
  }
  return { optedOut: channel };
}
