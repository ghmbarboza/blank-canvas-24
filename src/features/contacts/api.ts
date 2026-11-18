import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { segmentToOr } from "@/features/segments/rules";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";
import { callFunction } from "@/lib/functions";

import {
  escapeSearchTerm,
  normalizePhone,
  onlyDigits,
  type ContactFilters,
  type ContactRow,
  type ContactSort,
  type TeamMember,
} from "./types";

export const CONTACTS_PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 1000;

export const contactKeys = {
  all: (accountId: string) => ["contacts", accountId] as const,
  list: (
    accountId: string,
    filters: ContactFilters,
    sort: ContactSort,
    userId: string | null,
    ids: readonly string[] | null = null,
  ) => ["contacts", accountId, "list", filters, sort, userId, ids] as const,
  detail: (accountId: string, contactId: string) =>
    ["contacts", accountId, "detail", contactId] as const,
  search: (accountId: string, term: string) => ["contacts", accountId, "search", term] as const,
  // ["team", conta] é a lista completa de Ajustes (outro formato); esta é só a dos ativos.
  team: (accountId: string) => ["team", accountId, "active"] as const,
  sources: (accountId: string) => ["contacts", accountId, "sources"] as const,
};

// ---------------------------------------------------------------- equipe

export function useTeamMembers(accountId: string) {
  return useQuery({
    queryKey: contactKeys.team(accountId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data: rows, error } = await supabase
        .from("memberships")
        .select("user_id, role, display_name")
        .eq("account_id", accountId)
        .eq("is_active", true);
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles, error: pErr } = ids.length
        ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids)
        : { data: [], error: null };
      if (pErr) throw pErr;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (rows ?? [])
        .map((r) => {
          const p = byId.get(r.user_id);
          return {
            userId: r.user_id,
            name: r.display_name ?? p?.full_name ?? "Sem nome",
            avatarUrl: p?.avatar_url ?? null,
            role: r.role,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });
}

// Plataformas com canal na conta + origens fixas, para o filtro "Origem".
export function useContactSources(accountId: string) {
  return useQuery({
    queryKey: contactKeys.sources(accountId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select("platform")
        .eq("account_id", accountId);
      if (error) throw error;
      const platforms = new Set((data ?? []).map((c) => c.platform));
      return [...platforms, "manual", "csv"];
    },
  });
}

// ---------------------------------------------------------------- lista

const LIST_COLUMNS =
  "id, account_id, name, avatar_url, email, phone, company, job_title, city, tags, source, lifecycle, owner_user_id, score, temperature, ai_intent, ai_summary, ai_next_step, classified_at, last_interaction_at, created_at, updated_at, notes, custom, company_id, first_touch, last_touch";

type FilterOp =
  | { op: "eq"; column: "temperature" | "lifecycle" | "source" | "owner_user_id"; value: string }
  | { op: "isNull"; column: "temperature" }
  | { op: "ids"; value: string[] }
  | { op: "or"; value: string };

/** Teto de ids num filtro por momento (a lista vai na URL da consulta). */
export const MOMENT_FILTER_MAX = 200;
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

// Filtros viram uma lista de operações aplicada em cada consulta (lista, exportação).
function filterOps(
  filters: ContactFilters,
  userId: string | null,
  ids: readonly string[] | null = null,
): FilterOp[] {
  const ops: FilterOp[] = [];
  // filtro por momento do pós-venda: a tela calcula quem está no momento e manda os ids
  if (ids)
    ops.push({ op: "ids", value: ids.length ? ids.slice(0, MOMENT_FILTER_MAX) : [NO_MATCH] });
  if (filters.temperature === "none") ops.push({ op: "isNull", column: "temperature" });
  else if (filters.temperature !== "all")
    ops.push({ op: "eq", column: "temperature", value: filters.temperature });
  if (filters.lifecycle !== "all")
    ops.push({ op: "eq", column: "lifecycle", value: filters.lifecycle });
  if (filters.source !== "all") ops.push({ op: "eq", column: "source", value: filters.source });
  if (filters.onlyMine && userId) ops.push({ op: "eq", column: "owner_user_id", value: userId });
  const seg = filters.segment ? segmentToOr(filters.segment) : null;
  if (seg) ops.push({ op: "or", value: seg });
  const term = escapeSearchTerm(filters.search);
  if (term) {
    const digits = onlyDigits(term);
    const phoneTerm = digits.length >= 3 ? digits : term;
    ops.push({
      op: "or",
      value: [
        `name.ilike.*${term}*`,
        `email.ilike.*${term}*`,
        `company.ilike.*${term}*`,
        `phone.ilike.*${phoneTerm}*`,
      ].join(","),
    });
  }
  return ops;
}

interface ContactsPage {
  rows: ContactRow[];
  total: number;
  offset: number;
}

export function useContactsList(
  accountId: string,
  filters: ContactFilters,
  sort: ContactSort,
  userId: string | null,
  ids: readonly string[] | null = null,
) {
  return useInfiniteQuery({
    queryKey: contactKeys.list(accountId, filters, sort, userId, ids),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ContactsPage> => {
      let q = supabase
        .from("contacts")
        .select(LIST_COLUMNS, { count: "exact" })
        .eq("account_id", accountId);
      for (const f of filterOps(filters, userId, ids)) {
        q =
          f.op === "eq"
            ? q.eq(f.column, f.value)
            : f.op === "isNull"
              ? q.is(f.column, null)
              : f.op === "ids"
                ? q.in("id", f.value)
                : q.or(f.value);
      }
      const { data, error, count } = await q
        .order(sort.column, { ascending: !sort.desc, nullsFirst: false })
        .order("id", { ascending: true })
        .range(pageParam, pageParam + CONTACTS_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0, offset: pageParam };
    },
    getNextPageParam: (last) => {
      const next = last.offset + CONTACTS_PAGE_SIZE;
      return next < last.total ? next : undefined;
    },
  });
}

// Busca todas as linhas filtradas (paginando de 1000 em 1000: o PostgREST corta sem avisar).
export async function fetchAllFilteredContacts(
  accountId: string,
  filters: ContactFilters,
  sort: ContactSort,
  userId: string | null,
  ids: readonly string[] | null = null,
): Promise<ContactRow[]> {
  const out: ContactRow[] = [];
  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    let q = supabase.from("contacts").select(LIST_COLUMNS).eq("account_id", accountId);
    for (const f of filterOps(filters, userId, ids)) {
      q =
        f.op === "eq"
          ? q.eq(f.column, f.value)
          : f.op === "isNull"
            ? q.is(f.column, null)
            : f.op === "ids"
              ? q.in("id", f.value)
              : q.or(f.value);
    }
    const { data, error } = await q
      .order(sort.column, { ascending: !sort.desc, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < EXPORT_PAGE_SIZE) return out;
  }
}

// Busca curta para seletores (vincular contato a negócio etc.).
export function useContactSearch(accountId: string, term: string, enabled = true) {
  return useQuery({
    queryKey: contactKeys.search(accountId, term),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const base = supabase
        .from("contacts")
        .select("id, name, phone, email, company, source, avatar_url, score, temperature")
        .eq("account_id", accountId);
      const clean = escapeSearchTerm(term);
      const q = clean
        ? base.or(
            `name.ilike.*${clean}*,email.ilike.*${clean}*,company.ilike.*${clean}*,phone.ilike.*${clean}*`,
          )
        : base;
      const { data, error } = await q
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------- mutações

function invalidateContacts(qc: QueryClient, accountId: string) {
  return qc.invalidateQueries({ queryKey: contactKeys.all(accountId) });
}

export type ContactDraft = Omit<TablesInsert<"contacts">, "account_id">;

export function useCreateContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ContactDraft) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...draft, account_id: accountId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => invalidateContacts(qc, accountId),
  });
}

export function useUpdateContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"contacts"> }) => {
      const { error } = await supabase
        .from("contacts")
        .update(patch)
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => invalidateContacts(qc, accountId),
  });
}

export function useBulkUpdateContacts(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: TablesUpdate<"contacts"> }) => {
      const { error } = await supabase
        .from("contacts")
        .update(patch)
        .in("id", ids)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => invalidateContacts(qc, accountId),
  });
}

// Tag em massa: cada contato tem seu próprio array, então lê, mescla e grava um por um.
export function useBulkAddTag(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, tag }: { ids: string[]; tag: string }) => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, tags")
        .in("id", ids)
        .eq("account_id", accountId);
      if (error) throw error;
      const pending = (data ?? []).filter((c) => !c.tags.includes(tag));
      for (const c of pending) {
        const { error: uErr } = await supabase
          .from("contacts")
          .update({ tags: [...c.tags, tag] })
          .eq("id", c.id)
          .eq("account_id", accountId);
        if (uErr) throw uErr;
      }
      return pending.length;
    },
    onSuccess: () => invalidateContacts(qc, accountId),
  });
}

export interface ClassifyResult {
  score: number;
  temperature: string;
  intent: string | null;
  summary: string | null;
  next_step: string | null;
}

export function classifyContact(accountId: string, contactId: string): Promise<ClassifyResult> {
  return callApi<ClassifyResult>("/api/ai", { accountId, action: "classify", contactId });
}

export function useClassifyContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => classifyContact(accountId, contactId),
    onSuccess: () => invalidateContacts(qc, accountId),
  });
}

// ---------------------------------------------------------------- importação

export interface ImportReport {
  inserted: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

const IMPORT_BATCH = 500;
const LOOKUP_CHUNK = 200;

async function existingKeys(accountId: string, phones: string[], emails: string[]) {
  const phoneSet = new Set<string>();
  const emailSet = new Set<string>();
  // base antiga pode ter o número sem o 55: procura as duas formas
  const phoneVariants = phones.flatMap((p) =>
    p.startsWith("55") && p.length >= 12 ? [p, `+${p}`, p.slice(2)] : [p, `+${p}`],
  );
  for (let i = 0; i < phoneVariants.length; i += LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from("contacts")
      .select("phone")
      .eq("account_id", accountId)
      .in("phone", phoneVariants.slice(i, i + LOOKUP_CHUNK));
    if (error) throw error;
    for (const r of data ?? []) phoneSet.add(normalizePhone(r.phone) ?? "");
  }
  for (let i = 0; i < emails.length; i += LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from("contacts")
      .select("email")
      .eq("account_id", accountId)
      .in("email", emails.slice(i, i + LOOKUP_CHUNK));
    if (error) throw error;
    for (const r of data ?? []) if (r.email) emailSet.add(r.email.toLowerCase());
  }
  return { phoneSet, emailSet };
}

export async function importContacts(
  accountId: string,
  drafts: ContactDraft[],
): Promise<ImportReport> {
  const phones = [...new Set(drafts.map((d) => normalizePhone(d.phone) ?? "").filter(Boolean))];
  const emails = [...new Set(drafts.map((d) => (d.email ?? "").toLowerCase()).filter(Boolean))];
  const { phoneSet, emailSet } = await existingKeys(accountId, phones, emails);

  const fresh: TablesInsert<"contacts">[] = [];
  let duplicates = 0;
  for (const d of drafts) {
    const phone = normalizePhone(d.phone) ?? "";
    const email = (d.email ?? "").toLowerCase();
    if ((phone && phoneSet.has(phone)) || (email && emailSet.has(email))) {
      duplicates += 1;
      continue;
    }
    if (phone) phoneSet.add(phone);
    if (email) emailSet.add(email);
    fresh.push({ ...d, phone: phone || null, account_id: accountId });
  }

  const report: ImportReport = { inserted: 0, duplicates, failed: 0, errors: [] };
  for (let i = 0; i < fresh.length; i += IMPORT_BATCH) {
    const batch = fresh.slice(i, i + IMPORT_BATCH);
    const { error } = await supabase.from("contacts").insert(batch);
    if (error) {
      report.failed += batch.length;
      report.errors.push(error.message);
    } else {
      report.inserted += batch.length;
    }
  }
  return report;
}

export function useInvalidateContacts(accountId: string) {
  const qc = useQueryClient();
  return () => invalidateContacts(qc, accountId);
}

export type ContactLite = Pick<
  Tables<"contacts">,
  "id" | "name" | "phone" | "email" | "company" | "source" | "avatar_url" | "score" | "temperature"
>;

// ---------------------------------------------------------------- página do contato

export function useContact(accountId: string, contactId: string) {
  return useQuery({
    queryKey: contactKeys.detail(accountId, contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useContactIdentities(accountId: string, contactId: string) {
  return useQuery({
    queryKey: [...contactKeys.detail(accountId, contactId), "identities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_identities")
        .select("id, platform, handle, display_name")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ContactConversation {
  id: string;
  status: string;
  lastMessageAt: string | null;
  preview: string | null;
  unread: number;
  platform: string;
  channelName: string;
}

export function useContactConversations(accountId: string, contactId: string) {
  return useQuery({
    queryKey: [...contactKeys.detail(accountId, contactId), "conversations"],
    queryFn: async (): Promise<ContactConversation[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, channel_id, status, last_message_at, last_message_preview, unread_count")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      // Canal removido deixa a conversa sem channel_id (histórico preservado).
      const channelIds = [
        ...new Set((data ?? []).map((c) => c.channel_id).filter((id): id is string => Boolean(id))),
      ];
      const { data: channels, error: chErr } = channelIds.length
        ? await supabase.from("channels").select("id, platform, name").in("id", channelIds)
        : { data: [], error: null };
      if (chErr) throw chErr;
      const byId = new Map((channels ?? []).map((c) => [c.id, c]));
      return (data ?? []).map((c) => ({
        id: c.id,
        status: c.status,
        lastMessageAt: c.last_message_at,
        preview: c.last_message_preview,
        unread: c.unread_count,
        platform: (c.channel_id ? byId.get(c.channel_id)?.platform : undefined) ?? "webchat",
        channelName: (c.channel_id ? byId.get(c.channel_id)?.name : undefined) ?? "Canal removido",
      }));
    },
  });
}

export interface ContactDeal {
  id: string;
  title: string;
  value: number;
  status: string;
  stageName: string;
  stageColor: string;
  updatedAt: string;
}

export function useContactDeals(accountId: string, contactId: string) {
  return useQuery({
    queryKey: [...contactKeys.detail(accountId, contactId), "deals"],
    queryFn: async (): Promise<ContactDeal[]> => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, title, value, status, stage_id, updated_at")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const stageIds = [...new Set((data ?? []).map((d) => d.stage_id))];
      const { data: stages, error: sErr } = stageIds.length
        ? await supabase.from("pipeline_stages").select("id, name, color").in("id", stageIds)
        : { data: [], error: null };
      if (sErr) throw sErr;
      const byId = new Map((stages ?? []).map((s) => [s.id, s]));
      return (data ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        value: Number(d.value),
        status: d.status,
        stageName: byId.get(d.stage_id)?.name ?? "—",
        stageColor: byId.get(d.stage_id)?.color ?? "slate",
        updatedAt: d.updated_at,
      }));
    },
  });
}

export function useContactActivities(accountId: string, contactId: string) {
  return useQuery({
    queryKey: [...contactKeys.detail(accountId, contactId), "activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, type, title, body, created_at, user_id, deal_id")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContactClassifications(accountId: string, contactId: string) {
  return useQuery({
    queryKey: [...contactKeys.detail(accountId, contactId), "classifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_classifications")
        .select("id, score, temperature, intent, summary, next_step, created_at")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddContactNote(accountId: string, contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, userId }: { body: string; userId: string }) => {
      const { error } = await supabase.from("activities").insert({
        account_id: accountId,
        contact_id: contactId,
        type: "note",
        title: "Nota",
        body,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: [...contactKeys.detail(accountId, contactId), "activities"],
      }),
  });
}

// Canais de cada contato visível (identidades por plataforma), para os selos da lista.
// Só as linhas carregadas: no máximo uma página de 50 por chamada, em lotes de 200.
export function useContactChannels(accountId: string, contactIds: string[]) {
  return useQuery({
    queryKey: ["contacts", accountId, "channels", contactIds],
    enabled: contactIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const map = new Map<string, string[]>();
      for (let i = 0; i < contactIds.length; i += LOOKUP_CHUNK) {
        const { data, error } = await supabase
          .from("contact_identities")
          .select("contact_id, platform")
          .eq("account_id", accountId)
          .in("contact_id", contactIds.slice(i, i + LOOKUP_CHUNK));
        if (error) throw error;
        for (const r of data ?? []) {
          const list = map.get(r.contact_id) ?? [];
          if (!list.includes(r.platform)) map.set(r.contact_id, [...list, r.platform]);
        }
      }
      return map;
    },
  });
}
