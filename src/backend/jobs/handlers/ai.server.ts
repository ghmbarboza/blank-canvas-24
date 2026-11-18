// Classificação automática pela fila: cada mensagem recebida agenda "ai.classify" com espera de 20 s
// (a rajada termina antes da leitura) e no máximo uma por contato a cada 10 minutos.
import { admin } from "@/backend/http.server";
import { classifyContact } from "@/backend/ai/classify.server";

import { onDomainEvents } from "../events.server";
import { registerJob } from "../registry.server";

const MIN_INTERVAL_MS = 10 * 60_000;

registerJob("ai.classify", async (job) => {
  const contactId = (job.payload as { contact_id?: string }).contact_id;
  if (!job.account_id || !contactId) throw new Error("payload incompleto");
  const db = admin();
  const { data: c } = await db
    .from("contacts")
    .select("classified_at")
    .eq("id", contactId)
    .maybeSingle();
  if (c?.classified_at && Date.now() - new Date(c.classified_at).getTime() < MIN_INTERVAL_MS)
    return { skipped: "classificado há menos de 10 min" };
  const r = await classifyContact(job.account_id, contactId);
  return r ? { score: r.score, interests: r.interests } : { skipped: "sem conversa" };
});

onDomainEvents(async (events) => {
  const inbound = events.filter((e) => e.type === "message.received");
  if (!inbound.length) return;
  const db = admin();
  const accounts = [...new Set(inbound.map((e) => e.account_id))];
  const { data: rows, error: accErr } = await db
    .from("accounts")
    .select("id, settings")
    .in("id", accounts);
  if (accErr) throw new Error(`ai.classify contas: ${accErr.message}`);
  const off = new Set(
    (rows ?? [])
      .filter((a) => (a.settings as { auto_classify?: boolean } | null)?.auto_classify === false)
      .map((a) => a.id),
  );
  const seen = new Set<string>();
  for (const e of inbound) {
    const contactId = (e.payload as { contact_id?: string }).contact_id;
    if (!contactId || off.has(e.account_id) || seen.has(contactId)) continue;
    seen.add(contactId);
    const { error } = await db.rpc("enqueue_job", {
      _account: e.account_id,
      _kind: "ai.classify",
      _payload: { contact_id: contactId },
      _run_at: new Date(Date.now() + 20_000).toISOString(),
      _dedupe: `classify:${contactId}`,
    });
    if (error) throw new Error(`ai.classify enfileirar: ${error.message}`);
  }
});

export const registered = true;
