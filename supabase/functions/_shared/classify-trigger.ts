// Agenda a classificação depois de uma mensagem recebida, sem atrasar a resposta do webhook.
// Debounce: no máximo uma classificação por contato a cada 10 minutos.
import { adminClient } from "./supabase.ts";
import { classifyContact } from "./classify.ts";

const MIN_INTERVAL_MS = 10 * 60 * 1000;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

export function scheduleClassification(accountId: string, contactId: string) {
  const job = (async () => {
    const db = adminClient();
    const { data: account } = await db
      .from("accounts")
      .select("settings")
      .eq("id", accountId)
      .single();
    if ((account?.settings as { auto_classify?: boolean } | null)?.auto_classify === false) return;
    const { data: c } = await db
      .from("contacts")
      .select("classified_at")
      .eq("id", contactId)
      .single();
    if (c?.classified_at && Date.now() - new Date(c.classified_at).getTime() < MIN_INTERVAL_MS)
      return;
    // Espera a rajada terminar antes de ler o histórico.
    await new Promise((r) => setTimeout(r, 20_000));
    await classifyContact(accountId, contactId);
  })().catch((err) => console.warn("[classify] falhou", String(err)));

  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
}
