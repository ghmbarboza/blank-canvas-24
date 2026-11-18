// Roteamento da ligação recebida na Zadarma. A resposta ao webhook NOTIFY_START pode mudar o
// destino na hora: { redirect: "<ramal>", return_timeout: N } (doc oficial da API, seção
// "Call notification system - webhook"). Sem atendente livre, a ligação vai para o destino de
// transbordo da fila (ramal ou cenário que leva à IA de voz); sem isso, segue o cenário padrão.
import { admin } from "@/backend/http.server";

export interface ZadarmaRedirect {
  redirect: string;
  return_timeout?: number;
}

const RING_SECONDS = 20;

/** Corpo da resposta ao NOTIFY_START/NOTIFY_IVR que manda a ligação para um ramal ou cenário. */
export function zadarmaRedirect(target: string, returnTimeout: number): ZadarmaRedirect {
  if (!/^([0-9]{1,6}|[0-9]+-[0-9a-z]+|blacklist)$/.test(target))
    throw new Error(`destino inválido para a Zadarma: ${target}`);
  return { redirect: target, return_timeout: returnTimeout === 0 ? 0 : Math.max(3, returnTimeout) };
}

export async function routeInboundCall(
  accountId: string,
  callId: string,
): Promise<ZadarmaRedirect | null> {
  const db = admin();
  const { data: w } = await db
    .from("work_items")
    .select("id, queue_id, summary, subject, status")
    .eq("account_id", accountId)
    .eq("source_table", "calls")
    .eq("source_id", callId)
    .in("status", ["queued", "reserved"])
    .maybeSingle();
  if (!w) return null;
  const { data: picked } = await db.rpc("route_work_item", { _item: w.id });
  const r = Array.isArray(picked) ? picked[0] : null;
  if (r?.user_id) {
    // Passagem com resumo: quem vai atender lê antes de o telefone tocar.
    await db.rpc("notify_user", {
      _account: accountId,
      _user: r.user_id,
      _kind: "call_routed",
      _title: w.subject ?? "Ligação chegando para você",
      _body: w.summary ?? "",
      _link: "/fila",
    });
    if (r.extension) return zadarmaRedirect(r.extension, RING_SECONDS);
    return null;
  }
  if (!w.queue_id) return null;
  const { data: q } = await db
    .from("call_queues")
    .select("overflow, overflow_redirect")
    .eq("id", w.queue_id)
    .maybeSingle();
  if (q?.overflow === "ai" && q.overflow_redirect) {
    await db
      .from("work_items")
      .update({ handled_by: "ai", close_reason: "transbordo para a IA" })
      .eq("id", w.id);
    return zadarmaRedirect(q.overflow_redirect, 0);
  }
  return null;
}
