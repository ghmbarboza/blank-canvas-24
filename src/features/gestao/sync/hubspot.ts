// Adaptador direto do HubSpot (CRM API v3/v4, https://developers.hubspot.com/docs/api/crm).
// Token de app privado do cliente no cabeçalho Authorization: Bearer. Escopos mínimos:
// crm.objects.contacts.read/write, crm.objects.companies.read/write, crm.objects.deals.read/write.
// Mudanças são lidas pela busca (/search) ordenada pela data de alteração; o vínculo entre
// registros usa o endpoint de associação padrão (v4).
import { normalizePhone } from "../import/mapping";
import type {
  CompanyData,
  ContactData,
  CrmAdapter,
  DealData,
  EntityData,
  RemotePage,
  RemoteRecord,
  RemoteRefs,
  SyncEntity,
} from "./types";

export const HS_BASE = "https://api.hubapi.com";
const PAGE = 100;

type Fetch = typeof fetch;

const OBJECT: Record<SyncEntity, "contacts" | "companies" | "deals"> = {
  contact: "contacts",
  company: "companies",
  deal: "deals",
};
// Contato usa "lastmodifieddate"; empresa e negócio usam "hs_lastmodifieddate".
export const MODIFIED_PROP: Record<SyncEntity, string> = {
  contact: "lastmodifieddate",
  company: "hs_lastmodifieddate",
  deal: "hs_lastmodifieddate",
};
const PROPS: Record<SyncEntity, string[]> = {
  contact: [
    "firstname",
    "lastname",
    "email",
    "phone",
    "mobilephone",
    "jobtitle",
    "associatedcompanyid",
    "lastmodifieddate",
  ],
  company: ["name", "domain", "website", "phone", "industry", "hs_lastmodifieddate"],
  deal: ["dealname", "amount", "dealstage", "pipeline", "closedate", "hs_lastmodifieddate"],
};

export interface HsObject {
  id: string;
  properties: Record<string, string | null | undefined>;
  updatedAt?: string;
}

export interface HsStage {
  id: string;
  label: string;
  metadata?: { isClosed?: string; probability?: string };
}
export interface HsPipeline {
  id: string;
  label: string;
  stages: HsStage[];
}

// ───────────────────────── mapeamento (puro) ─────────────────────────
const p = (o: HsObject, k: string) => (o.properties[k] ?? "").toString().trim() || null;

export function hsContactToLocal(o: HsObject): RemoteRecord<ContactData> {
  const name = [p(o, "firstname"), p(o, "lastname")].filter(Boolean).join(" ") || null;
  return {
    id: o.id,
    updatedAt: o.updatedAt ?? p(o, "lastmodifieddate"),
    data: {
      name,
      email: p(o, "email")?.toLowerCase() ?? null,
      phone: normalizePhone(p(o, "mobilephone") ?? p(o, "phone")),
      job_title: p(o, "jobtitle"),
    },
    refs: { companyId: p(o, "associatedcompanyid") },
  };
}

export function localContactToHs(d: ContactData): Record<string, string> {
  const props: Record<string, string> = {};
  if (d.name) {
    const [first, ...rest] = d.name.trim().split(/\s+/);
    props["firstname"] = first ?? "";
    props["lastname"] = rest.join(" ");
  }
  if (d.email) props["email"] = d.email;
  if (d.phone) props["phone"] = `+${d.phone}`;
  if (d.job_title) props["jobtitle"] = d.job_title;
  return props;
}

export function hsCompanyToLocal(o: HsObject): RemoteRecord<CompanyData> {
  return {
    id: o.id,
    updatedAt: o.updatedAt ?? p(o, "hs_lastmodifieddate"),
    data: {
      name: p(o, "name") ?? p(o, "domain") ?? "Empresa sem nome",
      website: p(o, "website") ?? p(o, "domain"),
      phone: normalizePhone(p(o, "phone")),
      industry: p(o, "industry"),
    },
    refs: {},
  };
}

export function localCompanyToHs(d: CompanyData): Record<string, string> {
  // "industry" no HubSpot é uma lista fechada: texto livre daqui seria recusado, então não vai.
  const props: Record<string, string> = { name: d.name };
  if (d.website) props["website"] = d.website;
  if (d.phone) props["phone"] = `+${d.phone}`;
  return props;
}

export function stageStatus(stage: HsStage | undefined): DealData["status"] {
  if (!stage || stage.metadata?.isClosed !== "true") return "open";
  return Number(stage.metadata.probability ?? "0") >= 1 ? "won" : "lost";
}

export function hsDealToLocal(o: HsObject, pipelines: HsPipeline[]): RemoteRecord<DealData> {
  const stageId = p(o, "dealstage");
  const stage = pipelines.flatMap((pl) => pl.stages).find((s) => s.id === stageId);
  const amount = p(o, "amount");
  return {
    id: o.id,
    updatedAt: o.updatedAt ?? p(o, "hs_lastmodifieddate"),
    data: {
      title: p(o, "dealname") ?? "Negócio sem nome",
      value: amount !== null && Number.isFinite(Number(amount)) ? Number(amount) : null,
      stageName: stage?.label ?? null,
      status: stageStatus(stage),
      expected_close_date: p(o, "closedate")?.slice(0, 10) ?? null,
    },
    refs: {},
  };
}

/** Etapa de lá para o negócio daqui: pelo nome; ganho/perdido pela etapa fechada correspondente. */
export function pickHsStage(
  d: DealData,
  pipelines: HsPipeline[],
): { pipeline: string; stage: string } | null {
  const all = pipelines.flatMap((pl) => pl.stages.map((s) => ({ pl, s })));
  const byName = d.stageName
    ? all.find(({ s }) => s.label.trim().toLowerCase() === d.stageName!.trim().toLowerCase())
    : undefined;
  if (byName && (d.status === "open" || stageStatus(byName.s) === d.status))
    return { pipeline: byName.pl.id, stage: byName.s.id };
  if (d.status !== "open") {
    const closed = all.find(({ s }) => stageStatus(s) === d.status);
    if (closed) return { pipeline: closed.pl.id, stage: closed.s.id };
  }
  if (byName) return { pipeline: byName.pl.id, stage: byName.s.id };
  const first = pipelines[0]?.stages[0];
  return first ? { pipeline: pipelines[0]!.id, stage: first.id } : null;
}

export function localDealToHs(
  d: DealData,
  pipelines: HsPipeline[],
  isCreate: boolean,
): Record<string, string> {
  const props: Record<string, string> = { dealname: d.title };
  if (d.value !== null) props["amount"] = String(d.value);
  if (d.expected_close_date) props["closedate"] = `${d.expected_close_date}T12:00:00Z`;
  const st = pickHsStage(d, pipelines);
  if (st && (isCreate || d.stageName || d.status !== "open")) {
    props["pipeline"] = st.pipeline;
    props["dealstage"] = st.stage;
  }
  return props;
}

export function searchBody(entity: SyncEntity, since: string | null, after: string | null) {
  const prop = MODIFIED_PROP[entity];
  return {
    filterGroups: since
      ? [{ filters: [{ propertyName: prop, operator: "GT", value: String(Date.parse(since)) }] }]
      : [],
    sorts: [{ propertyName: prop, direction: "ASCENDING" }],
    properties: PROPS[entity],
    limit: PAGE,
    ...(after ? { after } : {}),
  };
}

// ───────────────────────── cliente ─────────────────────────
export class HsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function friendly(status: number, body: string): string {
  if (status === 401)
    return "O HubSpot recusou o token. Gere de novo em Configurações → Integrações → Apps privados e cole aqui.";
  if (status === 403) {
    const scope = body.match(/required scopes?[^"]*"([^"]+)/i)?.[1];
    return `O token do HubSpot não tem permissão para isso${scope ? ` (${scope})` : ""}. Marque os escopos de leitura e escrita de contatos, empresas e negócios no app privado.`;
  }
  if (status === 429) return "O HubSpot pediu para ir mais devagar. A próxima rodada continua.";
  if (status >= 500) return "O HubSpot está fora do ar agora. Tentamos de novo na próxima rodada.";
  try {
    const j = JSON.parse(body) as { message?: string };
    if (j.message) return `O HubSpot respondeu ${status}: ${j.message.slice(0, 200)}`;
  } catch {
    // corpo não é JSON
  }
  return `O HubSpot respondeu ${status}.`;
}

export function createHubspotAdapter(token: string, fetchImpl: Fetch = fetch): CrmAdapter {
  let pipelinesCache: HsPipeline[] | null = null;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(HS_BASE + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new HsError(res.status, friendly(res.status, text));
    return (text ? JSON.parse(text) : {}) as T;
  }
  async function pipelines(): Promise<HsPipeline[]> {
    if (pipelinesCache) return pipelinesCache;
    const r = await call<{ results?: HsPipeline[] }>("GET", "/crm/v3/pipelines/deals");
    pipelinesCache = r.results ?? [];
    return pipelinesCache;
  }
  async function associate(from: SyncEntity, fromId: string, to: SyncEntity, toId: string) {
    await call(
      "PUT",
      `/crm/v4/objects/${OBJECT[from]}/${encodeURIComponent(fromId)}/associations/default/${OBJECT[to]}/${encodeURIComponent(toId)}`,
    );
  }
  async function associateRefs(entity: SyncEntity, id: string, refs: RemoteRefs) {
    if (refs.companyId && entity !== "company")
      await associate(entity, id, "company", refs.companyId);
    if (entity === "deal")
      for (const c of (refs.contactIds ?? []).slice(0, 5))
        await associate("deal", id, "contact", c);
  }
  async function dealRefs(ids: string[]): Promise<Map<string, RemoteRefs>> {
    const out = new Map<string, RemoteRefs>();
    if (ids.length === 0) return out;
    const inputs = ids.map((id) => ({ id }));
    const [contacts, companies] = await Promise.all([
      call<{ results?: { from: { id: string }; to: { toObjectId: number | string }[] }[] }>(
        "POST",
        "/crm/v4/associations/deals/contacts/batch/read",
        { inputs },
      ),
      call<{ results?: { from: { id: string }; to: { toObjectId: number | string }[] }[] }>(
        "POST",
        "/crm/v4/associations/deals/companies/batch/read",
        { inputs },
      ),
    ]);
    for (const r of contacts.results ?? [])
      out.set(r.from.id, {
        ...out.get(r.from.id),
        contactIds: r.to.map((t) => String(t.toObjectId)),
      });
    for (const r of companies.results ?? [])
      out.set(r.from.id, {
        ...out.get(r.from.id),
        companyId: r.to[0] ? String(r.to[0].toObjectId) : null,
      });
    return out;
  }

  return {
    async test() {
      await call("GET", "/crm/v3/objects/contacts?limit=1");
      try {
        const info = await call<{ portalId?: number; companyCurrency?: string }>(
          "GET",
          "/account-info/v3/details",
        );
        return info.portalId ? `HubSpot · conta ${info.portalId}` : "HubSpot";
      } catch {
        return "HubSpot";
      }
    },
    async list(entity, since, page): Promise<RemotePage> {
      const r = await call<{ results?: HsObject[]; paging?: { next?: { after?: string } } }>(
        "POST",
        `/crm/v3/objects/${OBJECT[entity]}/search`,
        searchBody(entity, since, page),
      );
      const items = r.results ?? [];
      let records: RemoteRecord[];
      if (entity === "contact") records = items.map(hsContactToLocal);
      else if (entity === "company") records = items.map(hsCompanyToLocal);
      else {
        const pls = await pipelines();
        const refs = await dealRefs(items.map((i) => i.id));
        records = items.map((i) => ({ ...hsDealToLocal(i, pls), refs: refs.get(i.id) ?? {} }));
      }
      return { records, next: r.paging?.next?.after ?? null };
    },
    async create(entity, data, refs) {
      const properties =
        entity === "contact"
          ? localContactToHs(data as ContactData)
          : entity === "company"
            ? localCompanyToHs(data as CompanyData)
            : localDealToHs(data as DealData, await pipelines(), true);
      const r = await call<HsObject>("POST", `/crm/v3/objects/${OBJECT[entity]}`, { properties });
      await associateRefs(entity, r.id, refs);
      return { id: r.id, updatedAt: r.updatedAt ?? null };
    },
    async update(entity, id, data: EntityData, refs) {
      const properties =
        entity === "contact"
          ? localContactToHs(data as ContactData)
          : entity === "company"
            ? localCompanyToHs(data as CompanyData)
            : localDealToHs(data as DealData, await pipelines(), false);
      const r = await call<HsObject>(
        "PATCH",
        `/crm/v3/objects/${OBJECT[entity]}/${encodeURIComponent(id)}`,
        {
          properties,
        },
      );
      await associateRefs(entity, id, refs);
      return { updatedAt: r.updatedAt ?? null };
    },
  };
}
