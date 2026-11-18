// Resposta HUMANA pela caixa de entrada num canal de e-mail conectado pela Composio (#26).
// Rota de servidor (/api/email, action reply), nunca o edge send-message.
import { admin, HttpError } from "@/backend/http.server";

import { sendMailViaComposio } from "./composio.server";

export async function replyViaComposio(p: {
  accountId: string;
  userId: string;
  senderName: string | null;
  conversationId: string;
  toolkit: string;
  to: string;
  subject: string;
  text: string;
  hasAttachment: boolean;
  last: { thread_id?: string; message_id?: string } | null;
}): Promise<{ ok: true; messageId: string | null }> {
  if (p.hasAttachment)
    throw new HttpError(
      422,
      "Anexo ainda não sai pelo Gmail/Outlook conectado. Mande o texto e o arquivo pelo próprio e-mail.",
      "composio_attachment",
    );
  if (!p.text) throw new HttpError(422, "Escreva a resposta", "invalid");
  const db = admin();
  const { data: msg, error } = await db
    .from("messages")
    .insert({
      account_id: p.accountId,
      conversation_id: p.conversationId,
      direction: "out",
      sender_type: "user",
      sender_user_id: p.userId,
      sender_name: p.senderName,
      type: "text",
      body: p.text,
      status: "queued",
      metadata: { email: { subject: p.subject, via: "composio", toolkit: p.toolkit } },
    })
    .select("id")
    .single();
  if (error || !msg) throw new HttpError(500, "Não deu para registrar a resposta", "insert");
  try {
    const r = await sendMailViaComposio(p.accountId, p.toolkit, {
      to: p.to,
      subject: p.subject,
      text: p.text,
      threadId: p.last?.thread_id ?? null,
      messageId: p.last?.message_id ?? null,
    });
    await db
      .from("messages")
      .update({ status: "sent", external_id: r.logId ? `composio:${r.logId}` : null })
      .eq("id", msg.id);
    return { ok: true, messageId: msg.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .from("messages")
      .update({ status: "failed", error: reason.slice(0, 400) })
      .eq("id", msg.id);
    throw err instanceof HttpError ? err : new HttpError(422, reason, "provider_error");
  }
}
