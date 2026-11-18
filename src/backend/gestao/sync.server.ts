// Sincronização em dois sentidos com o CRM que o cliente já tem (RD Station CRM, HubSpot).
// Ordem: empresas → contatos → negócios. Em cada uma: traz o que mudou lá, depois leva o que mudou
// aqui. Conflito: a última alteração vence e vai para o log (crm_sync_log). Origem de cada registro
// em external_links. Tudo com account_id explícito (service_role).
import { admin } from "@/backend/http.server";
import { createHubspotAdapter } from "@/features/gestao/sync/hubspot";
import { createRdAdapter } from "@/features/gestao/sync/rdstation";
import {
  SYNC_ENTITIES,
  decide,
  diffFields,
  type CompanyData,
  type ContactData,
  type CrmAdapter,
  type DealData,
  type EntityData,
  type RemoteRecord,
  type RemoteRefs,
  type SyncEntity,
  type SyncProvider,
} from "@/features/gestao/sync/types";

import {
  loadPipelines,
  resolvePipeline,
  resolveStage,
  type PipelineCache,
} from "./crm-write.server";

const MAX_PAGES_PER_ENTITY = 5;
const MAX_PUSH_PER_ENTITY = 200;
const MAX_LOG_ROWS = 500;

export function tokenKey(provider: SyncProvider): string {
  return provider === "rdstation_crm" ? "crmsync_rd_token" : "crmsync_hubspot_token";
}

export async function readToken(accountId: string, provider: SyncProvider): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: tokenKey(provider),
  });
  return typeof data === "string" && data ? data : null;
}

export function adapterFor(provider: SyncProvider, token: string): CrmAdapter {
  return provider === "rdstation_crm" ? createRdAdapter(token) : createHubspotAdapter(token);
}

interface EntityCursor {
  since: string | null;
  page: string | null;
  pendingMax: string | null;
  pushSince: string | null;
}
type Cursors = Partial<Record<SyncEntity, EntityCursor>>;

interface Counters {
  pulled_created: number;
  pulled_updated: number;
  pushed_created: number;
  pushed_updated: number;
  conflicts: number;
  errors: number;
}

interface LogRow {
  account_id: string;
  provider: SyncProvider;
  run_id: string;
  entity: SyncEntity;
  direction: "pull" | "push";
  action: "created" | "updated" | "skipped" | "conflict" | "error";
  local_id: string | null;
  external_id: string | null;
  detail: Record<string, unknown>;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function isAuthError(err: unknown): boolean {
  const s = (err as { status?: number } | null)?.status;
  return s === 401 || s === 403;
}

export interface SyncResult extends Counters {
  provider: SyncProvider;
  finishedAt: string;
  limitations: string[];
}

export async function runSync(
  accountId: string,
  provider: SyncProvider,
  runId: string,
): Promise<SyncResult> {
  const db = admin();
  const { data: conn } = await db
    .from("crm_sync_connections")
    .select("*")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .maybeSingle();
  if (!conn) throw new Error("Conexão não encontrada");
  if (conn.status === "paused") return emptyResult(provider);
  const token = await readToken(accountId, provider);
  if (!token) throw new Error("Token não configurado");
  const adapter = adapterFor(provider, token);
  const cursors: Cursors = { ...((conn.cursors ?? {}) as Cursors) };
  const counters: Counters = {
    pulled_created: 0,
    pulled_updated: 0,
    pushed_created: 0,
    pushed_updated: 0,
    conflicts: 0,
    errors: 0,
  };
  const logs: LogRow[] = [];
  const log = (r: Omit<LogRow, "account_id" | "provider" | "run_id">) => {
    if (logs.length < MAX_LOG_ROWS)
      logs.push({ ...r, account_id: accountId, provider, run_id: runId });
  };
  const settings = (conn.settings ?? {}) as { pipeline_id?: string };
  const pipelines = await loadPipelines(accountId);
  const ctx: Ctx = {
    accountId,
    provider,
    adapter,
    pipelines,
    pipelineId: settings.pipeline_id ?? null,
    log,
    counters,
  };

  let fatal: string | null = null;
  try {
    for (const entity of SYNC_ENTITIES) {
      const cur: EntityCursor = {
        since: null,
        page: null,
        pendingMax: null,
        pushSince: null,
        ...cursors[entity],
      };
      const pulled = new Set<string>();
      if (conn.direction !== "push") {
        for (let i = 0; i < MAX_PAGES_PER_ENTITY; i += 1) {
          const page = await adapter.list(entity, cur.since, cur.page);
          for (const rec of page.records) {
            cur.pendingMax = maxIso(cur.pendingMax, rec.updatedAt);
            const localId = await guard(ctx, entity, "pull", rec.id, () =>
              pullOne(ctx, entity, rec),
            );
            if (localId) pulled.add(localId);
          }
          if (page.next) cur.page = page.next;
          else {
            cur.since = maxIso(cur.since, cur.pendingMax);
            cur.page = null;
            cur.pendingMax = null;
            break;
          }
        }
      }
      if (conn.direction !== "pull")
        cur.pushSince = await pushChanged(ctx, entity, cur.pushSince, pulled);
      cursors[entity] = cur;
    }
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
  }

  if (logs.length) await db.from("crm_sync_log").insert(logs as never);
  const result: SyncResult = {
    ...counters,
    provider,
    finishedAt: new Date().toISOString(),
    limitations: Object.values(adapter.limitations ?? {}),
  };
  await db
    .from("crm_sync_connections")
    .update({
      cursors: cursors as never,
      last_sync_at: result.finishedAt,
      last_result: result as never,
      status: fatal ? "error" : "connected",
      last_error: fatal ? fatal.slice(0, 500) : null,
    })
    .eq("account_id", accountId)
    .eq("provider", provider);
  if (fatal) throw new Error(fatal);
  return result;
}

function emptyResult(provider: SyncProvider): SyncResult {
  return {
    provider,
    pulled_created: 0,
    pulled_updated: 0,
    pushed_created: 0,
    pushed_updated: 0,
    conflicts: 0,
    errors: 0,
    finishedAt: new Date().toISOString(),
    limitations: [],
  };
}

interface Ctx {
  accountId: string;
  provider: SyncProvider;
  adapter: CrmAdapter;
  pipelines: PipelineCache;
  pipelineId: string | null;
  log: (r: Omit<LogRow, "account_id" | "provider" | "run_id">) => void;
  counters: Counters;
}

/** Erro de um registro não para a rodada; token recusado para tudo. */
async function guard<T>(
  ctx: Ctx,
  entity: SyncEntity,
  direction: "pull" | "push",
  ref: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isAuthError(err)) throw err;
    ctx.counters.errors += 1;
    ctx.log({
      entity,
      direction,
      action: "error",
      local_id: direction === "push" ? ref : null,
      external_id: direction === "pull" ? ref : null,
      detail: { message: (err instanceof Error ? err.message : String(err)).slice(0, 300) },
    });
    return null;
  }
}

// ───────────────────────── vínculos ─────────────────────────
async function linkByExternal(ctx: Ctx, entity: SyncEntity, externalId: string) {
  const { data } = await admin()
    .from("external_links")
    .select("local_id, remote_updated_at, local_synced_at")
    .eq("account_id", ctx.accountId)
    .eq("provider", ctx.provider)
    .eq("entity", entity)
    .eq("external_id", externalId)
    .maybeSingle();
  return data;
}

async function linkByLocal(ctx: Ctx, entity: SyncEntity, localId: string) {
  const { data } = await admin()
    .from("external_links")
    .select("external_id, remote_updated_at, local_synced_at")
    .eq("account_id", ctx.accountId)
    .eq("provider", ctx.provider)
    .eq("entity", entity)
    .eq("local_id", localId)
    .maybeSingle();
  return data;
}

async function saveLink(
  ctx: Ctx,
  entity: SyncEntity,
  localId: string,
  externalId: string,
  remoteAt: string | null,
  localAt: string | null,
) {
  const { error } = await admin().from("external_links").upsert(
    {
      account_id: ctx.accountId,
      provider: ctx.provider,
      entity,
      local_id: localId,
      external_id: externalId,
      remote_updated_at: remoteAt,
      local_synced_at: localAt,
    },
    { onConflict: "account_id,provider,entity,local_id" },
  );
  if (error) throw new Error(`vínculo: ${error.message}`);
}

async function localIdsFor(ctx: Ctx, entity: SyncEntity, externalIds: string[]): Promise<string[]> {
  if (externalIds.length === 0) return [];
  const { data } = await admin()
    .from("external_links")
    .select("local_id")
    .eq("account_id", ctx.accountId)
    .eq("provider", ctx.provider)
    .eq("entity", entity)
    .in("external_id", externalIds.slice(0, 50));
  return (data ?? []).map((r) => r.local_id);
}

async function externalIdsFor(ctx: Ctx, entity: SyncEntity, localIds: string[]): Promise<string[]> {
  if (localIds.length === 0) return [];
  const { data } = await admin()
    .from("external_links")
    .select("external_id")
    .eq("account_id", ctx.accountId)
    .eq("provider", ctx.provider)
    .eq("entity", entity)
    .in("local_id", localIds.slice(0, 50));
  return (data ?? []).map((r) => r.external_id);
}

// ───────────────────────── leitura local → formato comum ─────────────────────────
interface LocalRow {
  id: string;
  updated_at: string;
  data: EntityData;
  refs: { companyId: string | null; contactIds: string[] };
}

async function readLocal(ctx: Ctx, entity: SyncEntity, id: string): Promise<LocalRow | null> {
  const rows = await readLocalMany(ctx, entity, { ids: [id] });
  return rows[0] ?? null;
}

async function readLocalMany(
  ctx: Ctx,
  entity: SyncEntity,
  q: { ids?: string[]; updatedAfter?: string | null; limit?: number },
): Promise<LocalRow[]> {
  const db = admin();
  const limit = q.limit ?? 200;
  const after = q.updatedAfter ?? "1970-01-01T00:00:00Z";
  if (entity === "company") {
    let b = db
      .from("companies")
      .select("id, updated_at, name, website, phone, industry")
      .eq("account_id", ctx.accountId)
      .gt("updated_at", after);
    if (q.ids) b = b.in("id", q.ids);
    const { data, error } = await b.order("updated_at", { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      updated_at: r.updated_at,
      data: {
        name: r.name,
        website: r.website,
        phone: r.phone,
        industry: r.industry,
      } satisfies CompanyData,
      refs: { companyId: null, contactIds: [] },
    }));
  }
  if (entity === "contact") {
    let b = db
      .from("contacts")
      .select("id, updated_at, name, email, phone, job_title, company_id")
      .eq("account_id", ctx.accountId)
      .gt("updated_at", after);
    if (q.ids) b = b.in("id", q.ids);
    const { data, error } = await b.order("updated_at", { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      updated_at: r.updated_at,
      data: {
        name: r.name,
        email: r.email,
        phone: r.phone,
        job_title: r.job_title,
      } satisfies ContactData,
      refs: { companyId: r.company_id, contactIds: [] },
    }));
  }
  let b = db
    .from("deals")
    .select(
      "id, updated_at, title, value, status, expected_close_date, stage_id, contact_id, company_id",
    )
    .eq("account_id", ctx.accountId)
    .gt("updated_at", after);
  if (q.ids) b = b.in("id", q.ids);
  const { data, error } = await b.order("updated_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    updated_at: r.updated_at,
    data: {
      title: r.title,
      value: Number(r.value),
      stageName: ctx.pipelines.stages.find((s) => s.id === r.stage_id)?.name ?? null,
      status: (r.status as DealData["status"]) ?? "open",
      expected_close_date: r.expected_close_date,
    } satisfies DealData,
    refs: { companyId: r.company_id, contactIds: r.contact_id ? [r.contact_id] : [] },
  }));
}

// ───────────────────────── trazer (lá → aqui) ─────────────────────────
async function matchLocal(ctx: Ctx, entity: SyncEntity, rec: RemoteRecord): Promise<string | null> {
  const db = admin();
  if (entity === "contact") {
    const d = rec.data as ContactData;
    if (d.email) {
      const { data } = await db
        .from("contacts")
        .select("id")
        .eq("account_id", ctx.accountId)
        .eq("email", d.email)
        .limit(1)
        .maybeSingle();
      if (data) return data.id;
    }
    if (d.phone) {
      const { data } = await db
        .from("contacts")
        .select("id")
        .eq("account_id", ctx.accountId)
        .in("phone", [d.phone, `+${d.phone}`])
        .limit(1)
        .maybeSingle();
      if (data) return data.id;
    }
    return null;
  }
  if (entity === "company") {
    const d = rec.data as CompanyData;
    const { data } = await db
      .from("companies")
      .select("id")
      .eq("account_id", ctx.accountId)
      .ilike("name", d.name.replace(/[%_]/g, ""))
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

async function resolveRefsLocal(ctx: Ctx, refs: RemoteRefs) {
  const companyId = refs.companyId
    ? ((await localIdsFor(ctx, "company", [refs.companyId]))[0] ?? null)
    : null;
  let contactId: string | null =
    (await localIdsFor(ctx, "contact", refs.contactIds ?? []))[0] ?? null;
  if (!contactId && refs.contactEmails?.length) {
    const { data } = await admin()
      .from("contacts")
      .select("id")
      .eq("account_id", ctx.accountId)
      .in("email", refs.contactEmails.slice(0, 10))
      .limit(1)
      .maybeSingle();
    contactId = data?.id ?? null;
  }
  return { companyId, contactId };
}

async function writeLocal(
  ctx: Ctx,
  entity: SyncEntity,
  id: string | null,
  rec: RemoteRecord,
): Promise<{ id: string; updated_at: string }> {
  const db = admin();
  const refs = await resolveRefsLocal(ctx, rec.refs);
  const origin = ctx.provider;
  if (entity === "company") {
    const d = rec.data as CompanyData;
    const patch = {
      name: d.name.slice(0, 160),
      ...(d.website ? { website: d.website } : {}),
      ...(d.phone ? { phone: d.phone } : {}),
      ...(d.industry ? { industry: d.industry } : {}),
    };
    const q = id
      ? db.from("companies").update(patch).eq("id", id).eq("account_id", ctx.accountId)
      : db.from("companies").insert({ ...patch, account_id: ctx.accountId });
    const { data, error } = await q.select("id, updated_at").single();
    if (error || !data) throw new Error(error?.message ?? "empresa");
    return data;
  }
  if (entity === "contact") {
    const d = rec.data as ContactData;
    const patch = {
      ...(d.name ? { name: d.name } : {}),
      ...(d.email ? { email: d.email } : {}),
      ...(d.phone ? { phone: d.phone } : {}),
      ...(d.job_title ? { job_title: d.job_title } : {}),
      ...(refs.companyId ? { company_id: refs.companyId } : {}),
    };
    const q = id
      ? db.from("contacts").update(patch).eq("id", id).eq("account_id", ctx.accountId)
      : db.from("contacts").insert({ ...patch, account_id: ctx.accountId, source: origin });
    const { data, error } = await q.select("id, updated_at").single();
    if (error || !data) throw new Error(error?.message ?? "contato");
    return data;
  }
  const d = rec.data as DealData;
  let pipelineId = ctx.pipelineId;
  if (id) {
    const { data: cur } = await db
      .from("deals")
      .select("pipeline_id")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    pipelineId = cur?.pipeline_id ?? pipelineId;
  }
  if (!pipelineId || !ctx.pipelines.pipelines.some((p) => p.id === pipelineId))
    pipelineId = await resolvePipeline(ctx.accountId, ctx.pipelines, null, false);
  const stageId = await resolveStage(
    ctx.accountId,
    ctx.pipelines,
    pipelineId,
    d.stageName,
    d.status,
    true,
  );
  const patch = {
    title: d.title.slice(0, 160),
    ...(d.value !== null ? { value: d.value } : {}),
    stage_id: stageId,
    expected_close_date: d.expected_close_date,
    ...(refs.contactId ? { contact_id: refs.contactId } : {}),
    ...(refs.companyId ? { company_id: refs.companyId } : {}),
  };
  const q = id
    ? db.from("deals").update(patch).eq("id", id).eq("account_id", ctx.accountId)
    : db
        .from("deals")
        .insert({ ...patch, account_id: ctx.accountId, pipeline_id: pipelineId, source: origin });
  const { data, error } = await q.select("id, updated_at").single();
  if (error || !data) throw new Error(error?.message ?? "negócio");
  return data;
}

async function pullOne(ctx: Ctx, entity: SyncEntity, rec: RemoteRecord): Promise<string | null> {
  if (!rec.id) return null;
  const link = await linkByExternal(ctx, entity, rec.id);
  const localId = link?.local_id ?? (await matchLocal(ctx, entity, rec));
  if (!localId) {
    const created = await writeLocal(ctx, entity, null, rec);
    await saveLink(ctx, entity, created.id, rec.id, rec.updatedAt, created.updated_at);
    ctx.counters.pulled_created += 1;
    ctx.log({
      entity,
      direction: "pull",
      action: "created",
      local_id: created.id,
      external_id: rec.id,
      detail: {},
    });
    return created.id;
  }
  const local = await readLocal(ctx, entity, localId);
  if (!local) {
    // vínculo para um registro apagado aqui: recria
    const created = await writeLocal(ctx, entity, null, rec);
    await saveLink(ctx, entity, created.id, rec.id, rec.updatedAt, created.updated_at);
    ctx.counters.pulled_created += 1;
    ctx.log({
      entity,
      direction: "pull",
      action: "created",
      local_id: created.id,
      external_id: rec.id,
      detail: { reason: "apagado aqui" },
    });
    return created.id;
  }
  const decision = decide(link ?? null, local.updated_at, rec.updatedAt);
  if (decision.action === "pull") {
    const changed = diffFields(local.data, rec.data);
    let localAt = local.updated_at;
    if (changed.length > 0) {
      const w = await writeLocal(ctx, entity, localId, rec);
      localAt = w.updated_at;
      ctx.counters.pulled_updated += 1;
    }
    await saveLink(ctx, entity, localId, rec.id, rec.updatedAt, localAt);
    if (decision.conflict) ctx.counters.conflicts += 1;
    if (changed.length > 0 || decision.conflict)
      ctx.log({
        entity,
        direction: "pull",
        action: decision.conflict ? "conflict" : "updated",
        local_id: localId,
        external_id: rec.id,
        detail: decision.conflict
          ? {
              winner: "remoto",
              local_at: local.updated_at,
              remote_at: rec.updatedAt,
              fields: changed,
            }
          : { fields: changed },
      });
    return localId;
  }
  if (decision.action === "push") {
    if (decision.conflict) {
      ctx.counters.conflicts += 1;
      ctx.log({
        entity,
        direction: "push",
        action: "conflict",
        local_id: localId,
        external_id: rec.id,
        detail: { winner: "local", local_at: local.updated_at, remote_at: rec.updatedAt },
      });
    }
    await pushOne(ctx, entity, local, rec.id);
    return localId;
  }
  if (!link) await saveLink(ctx, entity, localId, rec.id, rec.updatedAt, local.updated_at);
  return localId;
}

// ───────────────────────── levar (aqui → lá) ─────────────────────────
async function remoteRefs(ctx: Ctx, entity: SyncEntity, local: LocalRow): Promise<RemoteRefs> {
  if (entity === "company") return {};
  const companyId = local.refs.companyId
    ? ((await externalIdsFor(ctx, "company", [local.refs.companyId]))[0] ?? null)
    : null;
  const contactIds =
    entity === "deal" ? await externalIdsFor(ctx, "contact", local.refs.contactIds) : [];
  return { companyId, contactIds };
}

async function pushOne(ctx: Ctx, entity: SyncEntity, local: LocalRow, externalId: string | null) {
  const refs = await remoteRefs(ctx, entity, local);
  if (externalId) {
    const r = await ctx.adapter.update(entity, externalId, local.data, refs);
    await saveLink(
      ctx,
      entity,
      local.id,
      externalId,
      r.updatedAt ?? new Date().toISOString(),
      local.updated_at,
    );
    ctx.counters.pushed_updated += 1;
    ctx.log({
      entity,
      direction: "push",
      action: "updated",
      local_id: local.id,
      external_id: externalId,
      detail: {},
    });
    return;
  }
  const r = await ctx.adapter.create(entity, local.data, refs);
  await saveLink(
    ctx,
    entity,
    local.id,
    r.id,
    r.updatedAt ?? new Date().toISOString(),
    local.updated_at,
  );
  ctx.counters.pushed_created += 1;
  ctx.log({
    entity,
    direction: "push",
    action: "created",
    local_id: local.id,
    external_id: r.id,
    detail: {},
  });
}

async function pushChanged(
  ctx: Ctx,
  entity: SyncEntity,
  since: string | null,
  pulled: Set<string>,
): Promise<string | null> {
  const rows = await readLocalMany(ctx, entity, {
    updatedAfter: since,
    limit: MAX_PUSH_PER_ENTITY,
  });
  let cursor = since;
  for (const local of rows) {
    cursor = maxIso(cursor, local.updated_at);
    if (pulled.has(local.id)) continue;
    if (entity === "contact") {
      const d = local.data as ContactData;
      if (!d.name && !d.email && !d.phone) continue;
    }
    await guard(ctx, entity, "push", local.id, async () => {
      const link = await linkByLocal(ctx, entity, local.id);
      if (link) {
        // Tudo o que mudou lá já foi trazido nesta rodada; aqui só conta se mudou daqui.
        const d = decide(link, local.updated_at, link.remote_updated_at);
        if (d.action !== "push") return;
        await pushOne(ctx, entity, local, link.external_id);
      } else await pushOne(ctx, entity, local, null);
    });
  }
  return cursor;
}
