// Outbox → webhooks de saída (assinados com HMAC-SHA256) e demais assinantes.
import { createHmac } from "node:crypto";

import { admin } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";
import { eventSubscribers, type DomainEvent } from "./events.server";

const MAX_ATTEMPTS = 8;

export function webhookSecretKey(endpointId: string): string {
  return `wh_${endpointId.replace(/-/g, "")}`;
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function dispatchDomainEvents(): Promise<{ count: number; errors: string[] }> {
  const db = admin();
  // Reserva atômica: o tique do minuto e a via rápida (5 s) nunca despacham o mesmo evento.
  const { data: events, error } = await db.rpc("claim_domain_events", {
    _limit: 200,
    _lease_seconds: 60,
  });
  if (error) throw new Error(`domain_events: ${error.message}`);
  const list = (events ?? []) as DomainEvent[];
  if (list.length === 0) return { count: 0, errors: [] };

  const accounts = [...new Set(list.map((e) => e.account_id))];
  const { data: endpoints } = await db
    .from("webhook_endpoints")
    .select("id, account_id, events")
    .in("account_id", accounts)
    .eq("is_active", true);

  const deliveries = list.flatMap((e) =>
    (endpoints ?? [])
      .filter(
        (ep) =>
          ep.account_id === e.account_id && (ep.events.includes(e.type) || ep.events.includes("*")),
      )
      .map((ep) => ({
        account_id: e.account_id,
        endpoint_id: ep.id,
        event_id: e.id,
        event_type: e.type,
        payload: {
          id: e.id,
          type: e.type,
          entity: e.entity,
          entity_id: e.entity_id,
          data: e.payload,
          created_at: e.created_at,
        },
      })),
  );
  if (deliveries.length > 0) {
    const { error: insErr } = await db.from("webhook_deliveries").insert(deliveries);
    if (insErr) throw new Error(`webhook_deliveries: ${insErr.message}`);
  }

  // Falha de assinante não segura o outbox, mas volta no relatório do tick (fica em net._http_response).
  const errors: string[] = [];
  for (const sub of eventSubscribers()) {
    try {
      await sub(list);
    } catch (err) {
      console.error("[outbox] assinante falhou", err);
      errors.push((err instanceof Error ? err.message : String(err)).slice(0, 300));
    }
  }

  const { error: upErr } = await db
    .from("domain_events")
    .update({ dispatched_at: new Date().toISOString() })
    .in(
      "id",
      list.map((e) => e.id),
    );
  if (upErr) throw new Error(`domain_events update: ${upErr.message}`);
  return { count: list.length, errors };
}

export async function deliverWebhooks(
  budgetMs: number,
): Promise<{ delivered: number; failed: number }> {
  const db = admin();
  const started = Date.now();
  const out = { delivered: 0, failed: 0 };
  const { data } = await db
    .from("webhook_deliveries")
    .select("id, account_id, endpoint_id, payload, attempts, webhook_endpoints(url, is_active)")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(25);

  for (const d of data ?? []) {
    if (Date.now() - started > budgetMs) break;
    const ep = d.webhook_endpoints as unknown as { url: string; is_active: boolean } | null;
    if (!ep?.is_active) {
      await db
        .from("webhook_deliveries")
        .update({ status: "failed", response_body: "endpoint inativo" })
        .eq("id", d.id);
      continue;
    }
    const { data: secret } = await db.rpc("secret_get", {
      _scope: "integration",
      _scope_id: d.account_id,
      _key: webhookSecretKey(d.endpoint_id),
    });
    const body = JSON.stringify(d.payload);
    const ts = Math.floor(Date.now() / 1000);
    const attempts = d.attempts + 1;
    let code = 0;
    let text = "";
    try {
      // destino conferido a cada envio e sem seguir redirecionamento (R8)
      const res = await publicFetch(
        ep.url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "NexusOne-Webhooks/1.0",
            "x-nexus-timestamp": String(ts),
            "x-nexus-signature": `sha256=${signPayload((secret as string | null) ?? "", ts, body)}`,
          },
          body,
          signal: AbortSignal.timeout(8_000),
        },
        { httpsOnly: true },
      );
      code = res.status;
      text = (await res.text()).slice(0, 500);
    } catch (err) {
      text = err instanceof Error ? err.message : String(err);
    }
    if (code >= 200 && code < 300) {
      out.delivered += 1;
      await db
        .from("webhook_deliveries")
        .update({
          status: "delivered",
          attempts,
          response_code: code,
          response_body: text,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", d.id);
    } else {
      out.failed += 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const next = new Date(
        Date.now() + Math.min(6 * 3600, 60 * 2 ** attempts) * 1000,
      ).toISOString();
      await db
        .from("webhook_deliveries")
        .update({
          status: dead ? "failed" : "pending",
          attempts,
          response_code: code || null,
          response_body: text,
          next_attempt_at: next,
        })
        .eq("id", d.id);
    }
  }
  return out;
}

export type { DomainEvent };
