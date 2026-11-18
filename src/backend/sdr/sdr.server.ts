// SDR no servidor: treina a pontuação preditiva com os ganhos e perdas da conta, aprende o horário
// em que cada contato responde e roteia o lead novo pelas regras de território/segmento/rodízio.
import { admin } from "@/backend/http.server";
import {
  bestHour,
  canTrain,
  predict,
  train,
  type LeadModel,
  type ReplySlot,
} from "@/features/sdr/model";
import { routeLead, stateFromPhone, type LeadInfo, type RoutingRule } from "@/features/sdr/routing";
import type { Json } from "@/integrations/supabase/types";

const BATCH = 500;

export interface TrainSummary {
  trained: boolean;
  reason: string;
  samples: number;
  accuracy: number | null;
  scored: number;
  hours: number;
}

export async function trainAndScore(accountId: string): Promise<TrainSummary> {
  const db = admin();
  const { data: labeled, error } = await db.rpc("lead_features", {
    _account: accountId,
    _labeled: true,
    _limit: 5000,
  });
  if (error) throw new Error(`lead_features: ${error.message}`);
  const check = canTrain(labeled ?? []);
  let model: LeadModel | null = null;
  let accuracy: number | null = null;
  let samples = (labeled ?? []).length;
  if (check.ok) {
    const r = train(labeled ?? []);
    model = r.model;
    accuracy = Math.round(r.accuracy * 1000) / 10;
    samples = r.samples;
    await db.from("lead_score_models").upsert({
      account_id: accountId,
      trained_at: new Date().toISOString(),
      samples: r.samples,
      positives: r.positives,
      weights: r.model as unknown as Json,
      metrics: { accuracy, reason: null } as Json,
    });
  } else {
    await db.from("lead_score_models").upsert({
      account_id: accountId,
      trained_at: new Date().toISOString(),
      samples,
      positives: (labeled ?? []).filter((x) => x.label === 1).length,
      weights: {} as Json,
      metrics: { accuracy: null, reason: check.reason } as Json,
    });
  }

  const { data: slots } = await db.rpc("contact_reply_times", { _account: accountId, _days: 180 });
  const byContact = new Map<string, ReplySlot[]>();
  for (const s of slots ?? [])
    byContact.set(s.contact_id, [
      ...(byContact.get(s.contact_id) ?? []),
      { hour: s.hour, dow: s.dow, n: s.n },
    ]);

  const { data: all } = await db.rpc("lead_features", {
    _account: accountId,
    _labeled: false,
    _limit: 5000,
  });
  const rows = (all ?? []).map((r) => {
    const p = model ? predict(model, r) : null;
    const h = bestHour(byContact.get(r.contact_id) ?? []);
    return {
      contact_id: r.contact_id,
      account_id: accountId,
      score: p?.score ?? null,
      factors: (p?.factors ?? []) as unknown as Json,
      best_hour: h?.hour ?? null,
      best_dow: h?.dow ?? null,
      reply_samples: h?.samples ?? 0,
      scored_at: new Date().toISOString(),
    };
  });
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: e } = await db.from("lead_scores").upsert(rows.slice(i, i + BATCH));
    if (e) throw new Error(`lead_scores: ${e.message}`);
  }
  return {
    trained: Boolean(model),
    reason: check.reason,
    samples,
    accuracy,
    scored: model ? rows.length : 0,
    hours: rows.filter((r) => r.best_hour !== null).length,
  };
}

async function leadInfo(
  accountId: string,
  contactId: string,
): Promise<{ info: LeadInfo; owner: string | null } | null> {
  const db = admin();
  const { data: c } = await db
    .from("contacts")
    .select(
      "id, city, phone, source, owner_user_id, company_id, companies(industry, size, address)",
    )
    .eq("id", contactId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!c) return null;
  const co = c.companies as unknown as {
    industry: string | null;
    size: string | null;
    address: { state?: string; city?: string } | null;
  } | null;
  return {
    owner: c.owner_user_id,
    info: {
      state: co?.address?.state ?? stateFromPhone(c.phone),
      city: c.city ?? co?.address?.city ?? null,
      segment: co?.industry ?? null,
      source: c.source,
      size: co?.size ?? null,
    },
  };
}

async function loadRules(accountId: string): Promise<RoutingRule[]> {
  const { data } = await admin()
    .from("lead_routing_rules")
    .select("id, name, position, is_active, match, mode, user_ids, rr_cursor")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("position");
  return (data ?? []).map((r) => ({
    ...r,
    match: (r.match ?? {}) as RoutingRule["match"],
    mode: r.mode as RoutingRule["mode"],
  }));
}

/** Escolhe o dono pelas regras. O cursor do rodízio avança no banco de forma atômica. */
export async function pickOwner(
  accountId: string,
  info: LeadInfo,
): Promise<{ userId: string; ruleId: string } | null> {
  const rules = await loadRules(accountId);
  const d = routeLead(rules, info);
  if (!d) return null;
  if (!d.usesCursor) {
    await admin().rpc("lead_route_bump", { _rule: d.rule.id });
    return { userId: d.userId, ruleId: d.rule.id };
  }
  const { data: cursor } = await admin().rpc("lead_route_bump", { _rule: d.rule.id });
  const n = d.rule.user_ids.length;
  const idx = typeof cursor === "number" ? ((cursor % n) + n) % n : 0;
  return { userId: d.rule.user_ids[idx] ?? d.userId, ruleId: d.rule.id };
}

/** Lead sem dono → dono pela regra (só grava se ainda estiver sem dono). */
export async function routeContact(
  accountId: string,
  contactId: string,
  opts: { notify?: boolean } = {},
): Promise<{ skipped?: string; owner?: string }> {
  const lead = await leadInfo(accountId, contactId);
  if (!lead) return { skipped: "contato não encontrado" };
  if (lead.owner) return { skipped: "já tem dono" };
  const pick = await pickOwner(accountId, lead.info);
  if (!pick) return { skipped: "nenhuma regra casou" };
  const db = admin();
  const { data } = await db
    .from("contacts")
    .update({ owner_user_id: pick.userId })
    .eq("id", contactId)
    .is("owner_user_id", null)
    .select("name, email")
    .maybeSingle();
  if (!data) return { skipped: "outro processo já definiu o dono" };
  if (opts.notify !== false)
    await db.rpc("notify_user", {
      _account: accountId,
      _user: pick.userId,
      _kind: "lead_new",
      _title: `Novo contato para você: ${data.name ?? data.email ?? "sem nome"}`,
      _body: "Distribuído pelo rodízio de contatos",
      _link: `/contatos/${contactId}`,
    });
  return { owner: pick.userId };
}

/** Simulação para a tela (não avança o rodízio). */
export async function simulateRoute(accountId: string, info: LeadInfo) {
  const rules = await loadRules(accountId);
  const d = routeLead(rules, info);
  if (!d) return { userId: null, ruleName: null, bookingSlug: null };
  const { data: page } = await admin()
    .from("booking_pages")
    .select("slug")
    .eq("account_id", accountId)
    .eq("owner_user_id", d.userId)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return { userId: d.userId, ruleName: d.rule.name, bookingSlug: page?.slug ?? null };
}
