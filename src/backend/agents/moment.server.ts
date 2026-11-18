// Momento do cliente no pós-venda para a ficha que o atendente de IA lê: data da compra, prazo de
// arrependimento, garantia, renovação e risco. Mesma conta da tela (features/posvenda/moment.ts).
import { admin } from "@/backend/http.server";
import type { Graph, Trigger } from "@/features/automations/engine";
import {
  DEFAULT_PARADO_DIAS,
  DEFAULT_RECOMPRA_DIAS,
  computeMoment,
  dayOfInstant,
  daysBetween,
  hasOpenComplaint,
  momentContext,
  prazosOf,
  purchaseDateOf,
  readsCancelIntent,
  renewalDateOf,
  reviewsOf,
  todayIso,
} from "@/features/posvenda/moment";
import { readRuleOptions, templateKeyFor } from "@/features/posvenda/rules";

/** Linhas do momento do cliente; vazio para quem ainda não é cliente ou se algo falhar. */
export async function momentLines(contactId: string): Promise<string[]> {
  try {
    const db = admin();
    const { data: c } = await db
      .from("contacts")
      .select(
        "account_id, lifecycle, source, tags, ai_intent, created_at, last_interaction_at, custom",
      )
      .eq("id", contactId)
      .maybeSingle();
    if (!c || c.lifecycle !== "customer") return [];
    const [acc, autos, won, nps] = await Promise.all([
      db.from("accounts").select("settings").eq("id", c.account_id).maybeSingle(),
      db
        .from("automations")
        .select("template_key, trigger, graph")
        .eq("account_id", c.account_id)
        .in("template_key", [templateKeyFor("recompra"), templateKeyFor("cliente_parado")])
        .neq("status", "archived")
        .order("created_at", { ascending: true }),
      db
        .from("deals")
        .select("closed_at")
        .eq("contact_id", contactId)
        .eq("status", "won")
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: true })
        .limit(1),
      db
        .from("nps_responses")
        .select("score")
        .eq("contact_id", contactId)
        .not("answered_at", "is", null)
        .order("answered_at", { ascending: false })
        .limit(1),
    ]);
    let recompraDias = DEFAULT_RECOMPRA_DIAS;
    let paradoDias = DEFAULT_PARADO_DIAS;
    for (const a of autos.data ?? []) {
      const row = { trigger: a.trigger as unknown as Trigger, graph: a.graph as unknown as Graph };
      if (a.template_key === templateKeyFor("recompra"))
        recompraDias = readRuleOptions("recompra", row).days ?? recompraDias;
      else paradoDias = readRuleOptions("cliente_parado", row).days ?? paradoDias;
    }
    const prazos = prazosOf(acc.data?.settings);
    const now = Date.now();
    const lastDay = dayOfInstant(c.last_interaction_at);
    const m = computeMoment(
      {
        purchaseDate: purchaseDateOf(c.custom),
        customerSince: won.data?.[0]?.closed_at ?? c.created_at,
        imported: /^(import|csv)/.test(c.source ?? ""),
        renewalDate: renewalDateOf(c.custom),
        risk: {
          npsLast: nps.data?.[0]?.score ?? null,
          silentDays: lastDay ? daysBetween(lastDay, todayIso(now)) : null,
          openComplaint: hasOpenComplaint(reviewsOf(c.custom)),
          cancelIntent: readsCancelIntent(c.ai_intent),
          taggedAtRisk: (c.tags ?? []).some((t) => t.trim().toLowerCase() === "em risco"),
        },
      },
      { prazos, recompraDias, paradoDias },
      now,
    );
    return momentContext(m, prazos);
  } catch (e) {
    console.error("[agente] momento do cliente não calculado", e);
    return [];
  }
}
