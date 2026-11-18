// Jobs da automação e da mensageria: automation.step, automation.scan, whatsapp.send, task.create.
// E o assinante do outbox que inscreve contatos por evento e acorda quem está esperando.
import { createTask, enroll, runStep, wakeContactRuns } from "@/backend/automations/runtime.server";
import { admin } from "@/backend/http.server";
import { sendWhatsApp } from "@/backend/messaging.server";
import { applySegment, isSegmentFilter } from "@/features/segments/rules";
import { triggerMatches, type Trigger } from "@/features/automations/engine";
import {
  PURCHASE_KEY,
  dayOfInstant,
  purchaseDateOf,
  todayIso,
  withCustomDate,
} from "@/features/posvenda/moment";
import type { Json } from "@/integrations/supabase/types";

import type { JobPayloads } from "../contract";
import { onDomainEvents } from "../events.server";
import { registerJob } from "../registry.server";

registerJob("automation.step", async (job) =>
  runStep(job.payload as unknown as JobPayloads["automation.step"]),
);

registerJob("task.create", async (job) => {
  if (!job.account_id) throw new Error("job sem conta");
  return createTask(job.account_id, job.payload as unknown as JobPayloads["task.create"]);
});

registerJob("whatsapp.send", async (job) => {
  if (!job.account_id) throw new Error("job sem conta");
  const p = job.payload as unknown as JobPayloads["whatsapp.send"];
  const r = await sendWhatsApp({
    accountId: job.account_id,
    contactId: p.contact_id,
    text: p.text ?? null,
    template: p.template ?? null,
    category: p.category,
    senderType: "system",
  });
  if (r.status === "deferred" && r.deferUntil) {
    // Horário silencioso: reenfileira para quando abrir, sem gastar tentativa.
    await admin().rpc("enqueue_job", {
      _account: job.account_id,
      _kind: "whatsapp.send",
      _payload: p as unknown as Json,
      _run_at: r.deferUntil,
    });
  }
  if (r.status === "skipped" && p.automation_run_id) {
    const { data: run } = await admin()
      .from("automation_runs")
      .select("account_id, automation_id, contact_id")
      .eq("id", p.automation_run_id)
      .maybeSingle();
    if (run)
      await admin()
        .from("automation_logs")
        .insert({
          ...run,
          run_id: p.automation_run_id,
          node_type: "whatsapp",
          status: "skipped",
          message: `WhatsApp não enviado: ${r.reason}`,
        });
  }
  return { ...r };
});

// Gatilhos que não vêm de evento: segmento, "sem resposta há N horas" e data. Roda a cada 5 min.
registerJob("automation.scan", async () => {
  const db = admin();
  const { data: autos } = await db
    .from("automations")
    .select("*")
    .eq("status", "active")
    .in("trigger->>type", ["segment", "no_reply", "date", "inactive"]);
  let total = 0;
  for (const a of autos ?? []) {
    const t = a.trigger as unknown as Trigger;
    let ids: string[] = [];
    if (t.type === "segment" && t.segment_id) {
      const { data: seg } = await db
        .from("segments")
        .select("filter")
        .eq("id", t.segment_id)
        .eq("account_id", a.account_id)
        .maybeSingle();
      if (!seg || !isSegmentFilter(seg.filter)) continue;
      const { data } = await applySegment(
        db.from("contacts").select("id").eq("account_id", a.account_id),
        seg.filter,
      ).limit(500);
      ids = (data ?? []).map((c) => c.id);
    } else if (t.type === "no_reply") {
      const hours = Math.max(1, Number(t.hours ?? 24));
      const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data } = await db
        .from("conversations")
        .select("contact_id, last_message_at, last_inbound_at")
        .eq("account_id", a.account_id)
        .eq("is_group", false)
        .in("status", ["open", "pending"])
        .lt("last_message_at", cutoff)
        .gt("last_message_at", new Date(Date.now() - (hours + 72) * 3600_000).toISOString())
        .limit(500);
      ids = (data ?? [])
        .filter(
          (c) => c.contact_id && (!c.last_inbound_at || c.last_message_at! > c.last_inbound_at),
        )
        .map((c) => c.contact_id!) as string[];
    } else if (t.type === "inactive") {
      // Cliente parado: quem já é cliente e não conversa há N dias. Entra uma vez por período de
      // silêncio: só volta a entrar se conversou de novo depois da última vez.
      const days = Math.max(1, Number(t.days ?? 30));
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data } = await db
        .from("contacts")
        .select("id, last_interaction_at")
        .eq("account_id", a.account_id)
        .eq("lifecycle", "customer")
        .lt("last_interaction_at", cutoff)
        .order("last_interaction_at", { ascending: false })
        .limit(200);
      const candidates = data ?? [];
      const { data: runs } = candidates.length
        ? await db
            .from("automation_runs")
            .select("contact_id, enrolled_at")
            .eq("automation_id", a.id)
            .in(
              "contact_id",
              candidates.map((c) => c.id),
            )
        : { data: [] };
      const lastRun = new Map<string, string>();
      for (const r of runs ?? [])
        if (!lastRun.has(r.contact_id) || lastRun.get(r.contact_id)! < r.enrolled_at)
          lastRun.set(r.contact_id, r.enrolled_at);
      ids = candidates
        .filter((c) => !lastRun.has(c.id) || lastRun.get(c.id)! < c.last_interaction_at!)
        .map((c) => c.id);
    } else if (t.type === "date" && t.field) {
      const target = new Date(Date.now() + Number(t.days_before ?? 0) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const key = t.field.replace(/^custom\./, "");
      const { data } = await db
        .from("contacts")
        .select("id")
        .eq("account_id", a.account_id)
        .eq(`custom->>${key}`, target)
        .limit(500);
      ids = (data ?? []).map((c) => c.id);
    }
    if (ids.length === 0) continue;
    const r = await enroll(a, ids, { source: `gatilho:${t.type}` });
    total += r.enrolled;
  }
  // Continua varrendo enquanto houver automação desse tipo ativa.
  if ((autos ?? []).length > 0) {
    await db.rpc("enqueue_job", {
      _account: (autos ?? [])[0]!.account_id,
      _kind: "automation.scan",
      _payload: {},
      _run_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      _dedupe: "automation.scan",
    });
  }
  return { automations: (autos ?? []).length, enrolled: total };
});

const WAKE_TYPES = new Set([
  "message.received",
  "meeting.scheduled",
  "email.opened",
  "email.clicked",
  "email.unsubscribed",
  "contact.lifecycle_changed",
  "deal.lost",
  "form.submitted",
]);

/**
 * Virou cliente e ninguém informou a data da compra: vale o dia em que virou cliente. É dessa data
 * (contacts.custom.ultima_compra) que saem o prazo de arrependimento, a garantia e a recompra.
 * Nunca troca uma data que já está lá.
 */
async function stampPurchaseDate(contactId: string, at: string | null) {
  const db = admin();
  const { data: c } = await db.from("contacts").select("custom").eq("id", contactId).maybeSingle();
  if (!c || purchaseDateOf(c.custom)) return;
  const day = dayOfInstant(at) ?? todayIso();
  const { error } = await db
    .from("contacts")
    .update({ custom: withCustomDate(c.custom, PURCHASE_KEY, day) as Json })
    .eq("id", contactId);
  if (error) console.error("[posvenda] data da compra não gravada", error.message);
}

onDomainEvents(async (events) => {
  const db = admin();
  const accounts = [...new Set(events.map((e) => e.account_id))];
  const { data: autos } = await db
    .from("automations")
    .select("*")
    .in("account_id", accounts)
    .eq("status", "active")
    .eq("trigger->>type", "event");
  for (const ev of events) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    const contactId =
      (typeof payload["contact_id"] === "string" ? (payload["contact_id"] as string) : null) ??
      (ev.entity === "contact" ? ev.entity_id : null);
    if (!contactId) continue;
    if (WAKE_TYPES.has(ev.type)) await wakeContactRuns(contactId);
    if (ev.type === "customer.new") await stampPurchaseDate(contactId, ev.created_at);
    for (const a of (autos ?? []).filter((x) => x.account_id === ev.account_id)) {
      if (!triggerMatches(a.trigger as unknown as Trigger, { type: ev.type, payload })) continue;
      await enroll(a, [contactId], {
        source: `evento:${ev.type}`,
        dealId: ev.entity === "deal" ? ev.entity_id : null,
        context: { event_id: ev.id },
      });
    }
  }
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
