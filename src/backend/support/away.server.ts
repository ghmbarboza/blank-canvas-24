// Resposta automática fora do horário (#65): o job "inbox.away" chama isto 45 s depois da
// mensagem do cliente. A decisão é a função pura awayDecision; aqui só lê o estado e envia.
import { admin } from "@/backend/http.server";

import { awayDecision, type AwaySettings } from "./away-logic";

export async function sendAwayIfNeeded(conversationId: string): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: conv } = await db
    .from("conversations")
    .select("id, account_id, status, last_inbound_at, is_group, channels(provider, platform)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.is_group || conv.status === "closed" || !conv.last_inbound_at)
    return { skipped: "conversa fechada, de grupo ou sem mensagem do cliente" };
  const channel = conv.channels as unknown as { provider: string; platform: string } | null;
  // e-mail tem a resposta automática do próprio servidor de e-mail: não repete aqui
  if (!channel || channel.provider === "email" || channel.platform === "email")
    return { skipped: "canal sem resposta automática" };

  const { data: acc } = await db
    .from("accounts")
    .select("timezone, settings")
    .eq("id", conv.account_id)
    .single();
  const settings = (acc?.settings ?? {}) as {
    business_hours?: Parameters<typeof awayDecision>[0]["businessHours"];
    away_message?: AwaySettings;
  };
  const [{ count: answered }, { data: lastAway }] = await Promise.all([
    db
      .from("messages")
      .select("id", { head: true, count: "exact" })
      .eq("conversation_id", conv.id)
      .eq("direction", "out")
      .eq("is_private", false)
      .gte("created_at", conv.last_inbound_at),
    db
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conv.id)
      .eq("metadata->>away", "true")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const d = awayDecision({
    now: new Date(),
    tz: acc?.timezone ?? "America/Sao_Paulo",
    businessHours: settings.business_hours ?? null,
    away: settings.away_message ?? null,
    answered: (answered ?? 0) > 0,
    lastAwayAt: lastAway ? new Date(lastAway.created_at) : null,
  });
  if (!d.send) return { skipped: d.reason };

  const { sendSystemText } = await import("./system-send.server");
  await sendSystemText(conv.id, channel.provider, conv.account_id, d.text, { away: true });
  return { sent: true };
}
