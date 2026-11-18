// Mensagem automática da empresa numa conversa (aviso fora do horário, pesquisa de satisfação).
// Chat do site grava direto (o visitante lê pelo poll); os outros canais saem pelo provedor.
import { admin } from "@/backend/http.server";

export async function sendSystemText(
  conversationId: string,
  provider: string,
  accountId: string,
  text: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (provider === "webchat") {
    const { error } = await admin()
      .from("messages")
      .insert({
        account_id: accountId,
        conversation_id: conversationId,
        direction: "out",
        sender_type: "system",
        sender_name: "Sistema",
        type: "text",
        body: text,
        status: "sent",
        metadata: metadata as never,
      });
    if (error) throw new Error(`chat do site: ${error.message}`);
    return;
  }
  const { sendToConversation } = await import("./channel-send.server");
  await sendToConversation(conversationId, { text, senderType: "system", metadata });
}
