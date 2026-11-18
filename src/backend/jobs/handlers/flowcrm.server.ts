// Vínculo → Flow CRM (revisão de 27/10, P3-1). O outbox (domain_events) enfileira um job por
// evento só para contas com a integração conectada; o job lê o estado atual e envia com
// Idempotency-Key = id do evento. Falha lança erro e a fila tenta de novo (backoff do runner).
import { admin } from "@/backend/http.server";
import { contactUpsert, saleNote, type FlowContact } from "@/backend/providers/flowcrm";
import { onDomainEvents } from "../events.server";
import { registerJob } from "../registry.server";

const EVENTS = new Set(["contact.created", "deal.won", "deal.lost"]);

onDomainEvents(async (events) => {
  const relevant = events.filter((e) => EVENTS.has(e.type) && e.entity_id);
  if (!relevant.length) return;
  const db = admin();
  const accounts = [...new Set(relevant.map((e) => e.account_id))];
  const { data: on } = await db
    .from("account_integrations")
    .select("account_id")
    .eq("provider", "flowcrm")
    .eq("status", "connected")
    .in("account_id", accounts);
  const connected = new Set((on ?? []).map((r) => r.account_id));
  for (const e of relevant) {
    if (!connected.has(e.account_id)) continue;
    await db.rpc("enqueue_job", {
      _account: e.account_id,
      _kind: "flowcrm.push",
      _payload: { event: e.type, entity_id: e.entity_id, event_id: e.id },
      _dedupe: `flowcrm:${e.id}`,
    });
  }
});

async function contactOf(contactId: string | null): Promise<FlowContact | null> {
  if (!contactId) return null;
  const { data } = await admin()
    .from("contacts")
    .select("name, email, phone, company, first_touch")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return null;
  const touch = (data.first_touch ?? {}) as { channel?: string; source?: string };
  return {
    name: data.name,
    email: data.email,
    phone: data.phone,
    company: data.company,
    origin: touch.channel ?? touch.source ?? null,
  };
}

registerJob("flowcrm.push", async (job) => {
  const p = job.payload as { event?: string; entity_id?: string; event_id?: string };
  if (!p.entity_id || !p.event) throw new Error("payload sem evento");
  const { getIntegration } = await import("@/backend/integrations.server");
  const it = await getIntegration(job.account_id!, "flowcrm");
  const url = it?.config["url"];
  const key = it?.secrets["key"];
  if (!it || it.status !== "connected" || !url || !key) return { skipped: "Flow CRM desligado" };
  const { flowcrmPost } = await import("@/backend/providers/flowcrm.server");
  const idem = `nexus:${p.event_id ?? `${p.event}:${p.entity_id}`}`;

  if (p.event === "contact.created") {
    const c = await contactOf(p.entity_id);
    if (!c || (!c.email && !c.phone)) return { skipped: "contato sem e-mail nem telefone" };
    await flowcrmPost(url, key, contactUpsert(c), idem);
    return { sent: "contact.upsert" };
  }

  const { data: deal } = await admin()
    .from("deals")
    .select("title, value, status, lost_reason, contact_id")
    .eq("id", p.entity_id)
    .maybeSingle();
  if (!deal || (deal.status !== "won" && deal.status !== "lost"))
    return { skipped: "negócio aberto" };
  const c = await contactOf(deal.contact_id);
  if (!c || (!c.email && !c.phone)) return { skipped: "negócio sem contato identificável" };
  await flowcrmPost(
    url,
    key,
    saleNote(c, {
      title: deal.title,
      value: deal.value,
      status: deal.status,
      reason: deal.lost_reason,
    }),
    idem,
  );
  return { sent: "note.create" };
});

export const registered = true;
