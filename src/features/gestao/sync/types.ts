// Contrato comum dos adaptadores de CRM externo (RD Station CRM, HubSpot) e a regra de conflito.

export type SyncProvider = "rdstation_crm" | "hubspot";
export type SyncEntity = "company" | "contact" | "deal";
export const SYNC_ENTITIES: SyncEntity[] = ["company", "contact", "deal"];

export const PROVIDER_LABEL: Record<SyncProvider, string> = {
  rdstation_crm: "RD Station CRM",
  hubspot: "HubSpot",
};

export const ENTITY_LABEL: Record<SyncEntity, string> = {
  company: "empresas",
  contact: "contatos",
  deal: "cartões da carteira",
};

export interface CompanyData {
  name: string;
  website: string | null;
  phone: string | null;
  industry: string | null;
}

export interface ContactData {
  name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
}

export interface DealData {
  title: string;
  value: number | null;
  stageName: string | null;
  status: "open" | "won" | "lost";
  expected_close_date: string | null;
}

export type EntityData = CompanyData | ContactData | DealData;

/** Referências entre registros no sistema de fora (ids de lá). */
export interface RemoteRefs {
  companyId?: string | null;
  contactIds?: string[];
  contactEmails?: string[];
}

export interface RemoteRecord<T extends EntityData = EntityData> {
  id: string;
  updatedAt: string | null;
  data: T;
  refs: RemoteRefs;
}

export interface RemotePage<T extends EntityData = EntityData> {
  records: RemoteRecord<T>[];
  /** Cursor para a próxima chamada (página do primeiro passe ou data). null = acabou. */
  next: string | null;
}

export interface CrmAdapter {
  /** Chamada barata para conferir o token. Devolve o nome da conta de lá. */
  test(): Promise<string>;
  /** Registros alterados depois de `since` (ou todos, no primeiro passe, paginando por `page`). */
  list(entity: SyncEntity, since: string | null, page: string | null): Promise<RemotePage>;
  create(
    entity: SyncEntity,
    data: EntityData,
    refs: RemoteRefs,
  ): Promise<{ id: string; updatedAt: string | null }>;
  update(
    entity: SyncEntity,
    id: string,
    data: EntityData,
    refs: RemoteRefs,
  ): Promise<{ updatedAt: string | null }>;
  /** O que este adaptador não leva para lá (aparece no log). */
  limitations?: Partial<Record<SyncEntity, string>>;
}

export interface LinkState {
  remote_updated_at: string | null;
  local_synced_at: string | null;
}

export type Decision =
  | { action: "pull"; conflict: boolean }
  | { action: "push"; conflict: boolean }
  | { action: "skip" };

const TOLERANCE_MS = 2000;

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Última alteração vence. Sem vínculo, os dois lados contam como alterados e vence o mais novo.
 * Mudou só um lado: ele vai para o outro. Mudaram os dois: conflito, vence o mais recente (e vai
 * para o log com os dois horários).
 */
export function decide(
  link: LinkState | null,
  localUpdatedAt: string | null,
  remoteUpdatedAt: string | null,
): Decision {
  const local = ts(localUpdatedAt);
  const remote = ts(remoteUpdatedAt);
  const localSynced = ts(link?.local_synced_at);
  const remoteSynced = ts(link?.remote_updated_at);
  const localChanged =
    local !== null && (localSynced === null || local > localSynced + TOLERANCE_MS);
  const remoteChanged =
    remote !== null && (remoteSynced === null || remote > remoteSynced + TOLERANCE_MS);
  if (localChanged && remoteChanged) {
    const conflict = link !== null;
    return (remote ?? 0) >= (local ?? 0)
      ? { action: "pull", conflict }
      : { action: "push", conflict };
  }
  if (remoteChanged) return { action: "pull", conflict: false };
  if (localChanged) return { action: "push", conflict: false };
  return { action: "skip" };
}

/** Diferenças relevantes entre dois registros (para o log e para não gravar à toa). */
export function diffFields(a: EntityData, b: EntityData): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    const va = (a as unknown as Record<string, unknown>)[k] ?? null;
    const vb = (b as unknown as Record<string, unknown>)[k] ?? null;
    const na = typeof va === "string" ? va.trim().toLowerCase() : va;
    const nb = typeof vb === "string" ? vb.trim().toLowerCase() : vb;
    if (na !== nb) out.push(k);
  }
  return out.sort();
}
