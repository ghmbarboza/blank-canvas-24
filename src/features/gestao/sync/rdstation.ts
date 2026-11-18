// Adaptador do RD Station CRM (API v1, https://developers.rdstation.com/reference/crm-v1-*).
// Base https://crm.rdstation.com/api/v1, token do usuário em ?token=. Limite: 120 req/min e
// listagem até os 10 mil primeiros registros. Teste de conexão: GET /token/check.
// O valor do negócio no RD é calculado pelos produtos (amount_total): vem para cá, mas não vai.
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

export const RD_BASE = "https://crm.rdstation.com/api/v1";
const PAGE_SIZE = 200;

type Fetch = typeof fetch;

// ───────────────────────── formatos documentados (só o que usamos) ─────────────────────────
export interface RdContact {
  _id?: string;
  id?: string;
  name?: string | null;
  title?: string | null;
  emails?: { email?: string | null }[];
  phones?: { phone?: string | null; type?: string | null }[];
  organization_id?: string | null;
  updated_at?: string | null;
}
export interface RdOrganization {
  _id?: string;
  id?: string;
  name?: string | null;
  url?: string | null;
  resume?: string | null;
  updated_at?: string | null;
}
export interface RdDeal {
  _id?: string;
  id?: string;
  name?: string | null;
  amount_total?: number | null;
  win?: boolean | null;
  prediction_date?: string | null;
  deal_stage?: { _id?: string; id?: string; name?: string | null } | null;
  contacts?: { name?: string | null; emails?: { email?: string | null }[] }[];
  organization?: { _id?: string; id?: string } | null;
  updated_at?: string | null;
}
export interface RdStage {
  _id?: string;
  id?: string;
  name: string;
  deal_pipeline?: { id?: string; name?: string } | null;
}

const idOf = (o: { _id?: string | undefined; id?: string | undefined }) => o._id ?? o.id ?? "";

// ───────────────────────── mapeamento (puro) ─────────────────────────
export function rdContactToLocal(c: RdContact): RemoteRecord<ContactData> {
  const email = c.emails?.map((e) => (e.email ?? "").trim().toLowerCase()).find(Boolean) ?? null;
  const phone = c.phones?.map((p) => normalizePhone(p.phone)).find(Boolean) ?? null;
  return {
    id: idOf(c),
    updatedAt: c.updated_at ?? null,
    data: { name: c.name?.trim() || null, email, phone, job_title: c.title?.trim() || null },
    refs: { companyId: c.organization_id ?? null },
  };
}

export function localContactToRd(
  d: ContactData,
  refs: RemoteRefs,
): { contact: Record<string, unknown> } {
  const contact: Record<string, unknown> = {
    name: d.name || d.email || d.phone || "Contato sem nome",
  };
  if (d.email) contact["emails"] = [{ email: d.email }];
  if (d.phone) contact["phones"] = [{ phone: d.phone, type: "cellphone" }];
  if (d.job_title) contact["title"] = d.job_title;
  if (refs.companyId) contact["organization_id"] = refs.companyId;
  return { contact };
}

export function rdOrganizationToLocal(o: RdOrganization): RemoteRecord<CompanyData> {
  return {
    id: idOf(o),
    updatedAt: o.updated_at ?? null,
    data: {
      name: o.name?.trim() || "Empresa sem nome",
      website: o.url?.trim() || null,
      phone: null,
      industry: null,
    },
    refs: {},
  };
}

export function localCompanyToRd(d: CompanyData): { organization: Record<string, unknown> } {
  const organization: Record<string, unknown> = { name: d.name };
  if (d.website) organization["url"] = d.website;
  return { organization };
}

export function rdDealToLocal(d: RdDeal): RemoteRecord<DealData> {
  const status: DealData["status"] = d.win === true ? "won" : d.win === false ? "lost" : "open";
  return {
    id: idOf(d),
    updatedAt: d.updated_at ?? null,
    data: {
      title: d.name?.trim() || "Negociação sem nome",
      value: typeof d.amount_total === "number" ? d.amount_total : null,
      stageName: d.deal_stage?.name ?? null,
      status,
      expected_close_date: d.prediction_date ? d.prediction_date.slice(0, 10) : null,
    },
    refs: {
      companyId: d.organization ? idOf(d.organization) || null : null,
      contactEmails: (d.contacts ?? [])
        .flatMap((c) => c.emails ?? [])
        .map((e) => (e.email ?? "").trim().toLowerCase())
        .filter(Boolean),
    },
  };
}

export function localDealToRd(
  d: DealData,
  refs: RemoteRefs,
  stages: RdStage[],
  isCreate: boolean,
): Record<string, unknown> {
  const deal: Record<string, unknown> = { name: d.title };
  if (d.expected_close_date) deal["prediction_date"] = d.expected_close_date;
  if (d.status === "won") deal["win"] = true;
  if (d.status === "lost") deal["win"] = false;
  const stage = d.stageName
    ? stages.find((s) => s.name.trim().toLowerCase() === d.stageName!.trim().toLowerCase())
    : undefined;
  const body: Record<string, unknown> = {};
  if (stage) {
    if (isCreate) deal["deal_stage_id"] = idOf(stage);
    else body["deal_stage_id"] = idOf(stage);
  }
  if (refs.companyId) {
    if (isCreate) body["organization"] = { _id: refs.companyId };
    else deal["organization_id"] = refs.companyId;
  }
  body["deal"] = deal;
  return body;
}

// ───────────────────────── cliente ─────────────────────────
export class RdError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function friendly(status: number, body: string): string {
  if (status === 401 || status === 403)
    return "O RD Station recusou o token. Copie de novo em Configurações da conta → Integrações → Token da instância.";
  if (status === 429)
    return "O RD Station pediu para ir mais devagar (limite de 120 por minuto). A próxima rodada continua.";
  if (status >= 500)
    return "O RD Station está fora do ar agora. Tentamos de novo na próxima rodada.";
  const msg = body.slice(0, 200);
  return `O RD Station respondeu ${status}: ${msg}`;
}

const PATH: Record<SyncEntity, { list: string; key: string }> = {
  contact: { list: "/contacts", key: "contacts" },
  company: { list: "/organizations", key: "organizations" },
  deal: { list: "/deals", key: "deals" },
};

export function createRdAdapter(token: string, fetchImpl: Fetch = fetch): CrmAdapter {
  let stagesCache: RdStage[] | null = null;
  async function call<T>(
    method: string,
    path: string,
    query: Record<string, string> = {},
    body?: unknown,
  ): Promise<T> {
    const url = new URL(RD_BASE + path);
    url.searchParams.set("token", token);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetchImpl(url.toString(), {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new RdError(res.status, friendly(res.status, text));
    return (text ? JSON.parse(text) : {}) as T;
  }

  async function stages(): Promise<RdStage[]> {
    if (stagesCache) return stagesCache;
    const r = await call<{ deal_stages?: RdStage[] }>("GET", "/deal_stages", { limit: "200" });
    stagesCache = r.deal_stages ?? [];
    return stagesCache;
  }

  return {
    limitations: {
      deal: "O valor do negócio não vai para o RD: lá ele é calculado pelos produtos.",
    },
    async test() {
      const r = await call<{ name?: string; email?: string; organization?: string }>(
        "GET",
        "/token/check",
      );
      return (
        [r.organization, r.name ?? r.email].filter(Boolean).join(" · ") || "Conta do RD Station"
      );
    },
    async list(entity, since, page): Promise<RemotePage> {
      const p = PATH[entity];
      // Primeiro passe (sem data): do mais antigo ao mais novo, página a página.
      // Depois: do mais novo para trás, parando no que já vimos.
      const firstPass = since === null;
      const pageNo = Number(page ?? "1") || 1;
      const raw = await call<Record<string, unknown>>("GET", p.list, {
        page: String(pageNo),
        limit: String(PAGE_SIZE),
        order: "updated_at",
        direction: firstPass ? "asc" : "desc",
      });
      const items = (raw[p.key] as unknown[] | undefined) ?? [];
      const mapped = items.map((it) =>
        entity === "contact"
          ? rdContactToLocal(it as RdContact)
          : entity === "company"
            ? rdOrganizationToLocal(it as RdOrganization)
            : rdDealToLocal(it as RdDeal),
      ) as RemoteRecord[];
      const hasMore = raw["has_more"] === true || items.length === PAGE_SIZE;
      if (firstPass) return { records: mapped, next: hasMore ? String(pageNo + 1) : null };
      const sinceTs = Date.parse(since);
      const fresh = mapped.filter((r) => !r.updatedAt || Date.parse(r.updatedAt) > sinceTs);
      const reachedOld = fresh.length < mapped.length;
      return { records: fresh, next: hasMore && !reachedOld ? String(pageNo + 1) : null };
    },
    async create(entity, data, refs) {
      if (entity === "contact") {
        const r = await call<RdContact>(
          "POST",
          "/contacts",
          {},
          localContactToRd(data as ContactData, refs),
        );
        return { id: idOf(r), updatedAt: r.updated_at ?? null };
      }
      if (entity === "company") {
        const r = await call<RdOrganization>(
          "POST",
          "/organizations",
          {},
          localCompanyToRd(data as CompanyData),
        );
        return { id: idOf(r), updatedAt: r.updated_at ?? null };
      }
      const r = await call<RdDeal>(
        "POST",
        "/deals",
        {},
        localDealToRd(data as DealData, refs, await stages(), true),
      );
      return { id: idOf(r), updatedAt: r.updated_at ?? null };
    },
    async update(entity, id, data: EntityData, refs) {
      const safe = encodeURIComponent(id);
      if (entity === "contact") {
        const r = await call<RdContact>(
          "PUT",
          `/contacts/${safe}`,
          {},
          localContactToRd(data as ContactData, refs),
        );
        return { updatedAt: r.updated_at ?? null };
      }
      if (entity === "company") {
        const r = await call<RdOrganization>(
          "PUT",
          `/organizations/${safe}`,
          {},
          localCompanyToRd(data as CompanyData),
        );
        return { updatedAt: r.updated_at ?? null };
      }
      const r = await call<RdDeal>(
        "PUT",
        `/deals/${safe}`,
        {},
        localDealToRd(data as DealData, refs, await stages(), false),
      );
      return { updatedAt: r.updated_at ?? null };
    },
  };
}
