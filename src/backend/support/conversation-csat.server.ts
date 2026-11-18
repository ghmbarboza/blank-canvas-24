// CSAT ao fechar conversa (#68): o gatilho do banco enfileira; isto confere e envia a pesquisa
// no próprio canal da conversa. No máximo uma pesquisa por contato a cada 7 dias.
import { admin, appBaseUrl } from "@/backend/http.server";

export const CSAT_COOLDOWN_DAYS = 7;

export function csatText(firstName: string, link: string): string {
  return `Oi${firstName ? `, ${firstName}` : ""}! Como foi o nosso atendimento? Leva 10 segundos: ${link}`;
}

export async function sendConversationCsat(
  conversationId: string,
): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: conv } = await db
    .from("conversations")
    .select(
      "id, account_id, status, contact_id, is_group, channels(provider, platform), contacts(name)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.status !== "closed" || !conv.contact_id || conv.is_group)
    return { skipped: "conversa reaberta, de grupo ou sem contato" };
  const channel = conv.channels as unknown as { provider: string; platform: string } | null;
  if (!channel || channel.provider === "email" || channel.platform === "email")
    return { skipped: "canal sem pesquisa automática" };

  const since = new Date(Date.now() - CSAT_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { count } = await db
    .from("csat_responses")
    .select("id", { head: true, count: "exact" })
    .eq("contact_id", conv.contact_id)
    .gte("sent_at", since);
  if ((count ?? 0) > 0) return { skipped: "contato já recebeu pesquisa nos últimos 7 dias" };

  const { data: row, error } = await db
    .from("csat_responses")
    .insert({
      account_id: conv.account_id,
      contact_id: conv.contact_id,
      conversation_id: conv.id,
      channel: "conversation",
    })
    .select("id, token")
    .single();
  if (error || !row) throw new Error(error?.message ?? "falha ao criar pesquisa");
  const name = (conv.contacts as unknown as { name: string | null } | null)?.name ?? "";
  const text = csatText(name.split(" ")[0] ?? "", `${appBaseUrl()}/csat/${row.token}`);
  try {
    const { sendSystemText } = await import("./system-send.server");
    await sendSystemText(conv.id, channel.provider, conv.account_id, text, { csat: true });
  } catch (err) {
    // sem canal (ex.: fora da janela de 24 h do WhatsApp oficial): não deixa pesquisa órfã
    await db.from("csat_responses").delete().eq("id", row.id);
    return { skipped: `não enviada: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { sent: true };
}
