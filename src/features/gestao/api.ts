// Hooks de dados da gestão: escala, indicadores, saúde do cliente, importador, sincronização com
// CRM externo e modelos por segmento. Chaves começam por "gestao" e levam o accountId.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { HistoryRow } from "./forecast";
import type { HealthSignals } from "./health";
import type { ImportRecord, ImportSource, TargetField } from "./import/mapping";
import type { PresenceInterval } from "./schedule";
import type { SyncProvider } from "./sync/types";
import { segmentTemplate, type SegmentKey } from "./templates/segments";

export const gestaoKeys = {
  settings: (a: string) => ["gestao", a, "settings"] as const,
  history: (a: string, w: number) => ["gestao", a, "history", w] as const,
  shifts: (a: string, from: string, to: string) => ["gestao", a, "shifts", from, to] as const,
  presence: (a: string, from: string, to: string) => ["gestao", a, "presence", from, to] as const,
  trends: (a: string, from: string, to: string, g: string) =>
    ["gestao", a, "trends", from, to, g] as const,
  health: (a: string) => ["gestao", a, "health"] as const,
  imports: (a: string) => ["gestao", a, "imports"] as const,
  crm: (a: string) => ["gestao", a, "crm"] as const,
  templates: (a: string) => ["gestao", a, "templates"] as const,
};

// ───────────────────────── escala ─────────────────────────
export interface WorkforceSettings {
  service_level_pct: number;
  answer_seconds: number;
  shrinkage_pct: number;
  chat_concurrency: number;
  aht_seconds: Record<string, number>;
  weeks_history: number;
  saved: boolean;
}

export const DEFAULT_SETTINGS: WorkforceSettings = {
  service_level_pct: 80,
  answer_seconds: 20,
  shrinkage_pct: 30,
  chat_concurrency: 3,
  aht_seconds: {},
  weeks_history: 8,
  saved: false,
};

export function useWorkforceSettings(accountId: string) {
  return useQuery({
    queryKey: gestaoKeys.settings(accountId),
    queryFn: async (): Promise<WorkforceSettings> => {
      const { data, error } = await supabase
        .from("workforce_settings")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      const aht: Record<string, number> = {};
      const raw = (data.aht_seconds ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && v > 0) aht[k] = v;
      return {
        service_level_pct: data.service_level_pct,
        answer_seconds: data.answer_seconds,
        shrinkage_pct: data.shrinkage_pct,
        chat_concurrency: data.chat_concurrency,
        aht_seconds: aht,
        weeks_history: data.weeks_history,
        saved: true,
      };
    },
  });
}

export function useSaveWorkforceSettings(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Omit<WorkforceSettings, "saved">) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("workforce_settings").upsert(
        {
          account_id: accountId,
          service_level_pct: s.service_level_pct,
          answer_seconds: s.answer_seconds,
          shrinkage_pct: s.shrinkage_pct,
          chat_concurrency: s.chat_concurrency,
          aht_seconds: s.aht_seconds as Json,
          weeks_history: s.weeks_history,
          updated_by: u.user?.id ?? null,
        },
        { onConflict: "account_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gestaoKeys.settings(accountId) }),
  });
}

export function useVolumeHistory(accountId: string, weeks: number) {
  return useQuery({
    queryKey: gestaoKeys.history(accountId, weeks),
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase.rpc("workforce_history", {
        _account: accountId,
        _weeks: weeks,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        channel: r.channel,
        day: r.day,
        hour: r.hour,
        arrivals: r.arrivals,
        handle_seconds: r.handle_seconds === null ? null : Number(r.handle_seconds),
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export interface ShiftRow {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  channel: string;
  breaks: { start: string; end: string; label?: string }[];
  note: string | null;
}

export function useShifts(accountId: string, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: gestaoKeys.shifts(accountId, fromIso, toIso),
    queryFn: async (): Promise<ShiftRow[]> => {
      const { data, error } = await supabase
        .from("workforce_shifts")
        .select("id, user_id, starts_at, ends_at, channel, breaks, note")
        .eq("account_id", accountId)
        .lt("starts_at", toIso)
        .gt("ends_at", fromIso)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        breaks: Array.isArray(r.breaks) ? (r.breaks as ShiftRow["breaks"]) : [],
      }));
    },
  });
}

export function useCreateShifts(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: {
        user_id: string;
        starts_at: string;
        ends_at: string;
        channel: string;
        breaks: ShiftRow["breaks"];
      }[],
    ) => {
      if (rows.length === 0) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("workforce_shifts").insert(
        rows.map((r) => ({
          ...r,
          breaks: r.breaks as Json,
          account_id: accountId,
          created_by: u.user?.id ?? null,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", accountId, "shifts"] }),
  });
}

export function useDeleteShift(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("workforce_shifts")
        .delete()
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", accountId, "shifts"] }),
  });
}

export function usePresence(accountId: string, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: gestaoKeys.presence(accountId, fromIso, toIso),
    queryFn: async (): Promise<{ available: boolean; rows: PresenceInterval[] }> => {
      const { data, error } = await supabase.rpc("workforce_presence", {
        _account: accountId,
        _from: fromIso,
        _to: toIso,
      });
      if (error) throw error;
      const out = (data ?? {}) as {
        available?: boolean;
        rows?: { user_id: string; status: string; started_at: string; ended_at: string | null }[];
      };
      return {
        available: Boolean(out.available),
        rows: (out.rows ?? []).map((r) => ({
          userId: r.user_id,
          status: r.status,
          start: Date.parse(r.started_at),
          end: r.ended_at ? Date.parse(r.ended_at) : null,
        })),
      };
    },
  });
}

// ───────────────────────── indicadores ─────────────────────────
export interface TrendRow {
  week: string;
  group_key: string;
  group_label: string;
  voice: {
    inbound: number;
    answered: number;
    abandoned: number;
    tme_seconds: number | null;
    tma_seconds: number | null;
    fcr_ok: number;
    fcr_base: number;
  } | null;
  tickets: {
    created: number;
    resolved: number;
    frt_seconds: number | null;
    resolution_seconds: number | null;
    fcr_ok: number;
    csat_avg: number | null;
    csat_n: number;
  } | null;
  nps: { n: number; promoters: number; detractors: number } | null;
}

export function useTrends(accountId: string, from: string, to: string, group: "team" | "agent") {
  return useQuery({
    queryKey: gestaoKeys.trends(accountId, from, to, group),
    queryFn: async (): Promise<TrendRow[]> => {
      const { data, error } = await supabase.rpc("gestao_trends", {
        _account: accountId,
        _from: from,
        _to: to,
        _group: group,
      });
      if (error) throw error;
      return ((data as { rows?: TrendRow[] } | null)?.rows ?? []) as TrendRow[];
    },
  });
}

// ───────────────────────── saúde do cliente ─────────────────────────
export function useCustomerHealth(accountId: string) {
  return useQuery({
    queryKey: gestaoKeys.health(accountId),
    queryFn: async (): Promise<HealthSignals[]> => {
      const { data, error } = await supabase.rpc("customer_health_signals", {
        _account: accountId,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        csat_avg_90d: r.csat_avg_90d === null ? null : Number(r.csat_avg_90d),
        mrr: Number(r.mrr ?? 0),
        won_value_12m: Number(r.won_value_12m ?? 0),
      }));
    },
    staleTime: 60_000,
  });
}

// ───────────────────────── importador ─────────────────────────
export interface ImportPayload {
  source: ImportSource;
  fileName: string | null;
  mapping: TargetField[];
  records: ImportRecord[];
}

export interface ImportPreview {
  totals: {
    rows: number;
    contactsNew: number;
    contactsUpdated: number;
    mergedInFile: number;
    companiesNew: number;
    companiesExisting: number;
    deals: number;
    skipped: number;
  };
  warnings: { line: number; message: string }[];
  skipped: { line: number; reason: string }[];
  sample: {
    contacts: {
      name: string | null;
      email: string | null;
      phone: string | null;
      action: "create" | "update";
      fills: string[];
      lines: number[];
    }[];
    companies: { name: string; cnpj: string | null; action: "create" | "update" }[];
    deals: { title: string; value: number | null; stage: string | null; status: string | null }[];
  };
}

export interface ImportResult {
  batchId: string;
  report: {
    contactsCreated: number;
    contactsUpdated: number;
    companiesCreated: number;
    companiesUpdated: number;
    dealsCreated: number;
    mergedInFile: number;
    skipped: number;
    errors: { line: number; message: string }[];
  };
}

export function usePreviewImport(accountId: string) {
  return useMutation({
    mutationFn: (payload: ImportPayload) =>
      callApi<ImportPreview>("/api/gestao", { accountId, action: "import.preview", payload }),
  });
}

export function useCommitImport(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ImportPayload) =>
      callApi<ImportResult>("/api/gestao", { accountId, action: "import.commit", payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gestaoKeys.imports(accountId) });
      void qc.invalidateQueries({ queryKey: ["contacts", accountId] });
      void qc.invalidateQueries({ queryKey: ["companies", accountId] });
      void qc.invalidateQueries({ queryKey: ["deals", accountId] });
    },
  });
}

export function useImportBatches(accountId: string) {
  return useQuery({
    queryKey: gestaoKeys.imports(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("id, source, file_name, status, totals, report, error, created_at, finished_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ───────────────────────── sincronização com CRM externo ─────────────────────────
export interface CrmConnection {
  provider: SyncProvider;
  status: "pending" | "connected" | "error" | "paused";
  direction: "both" | "pull" | "push";
  settings: { pipeline_id?: string | null };
  connected_label: string | null;
  last_sync_at: string | null;
  last_result: {
    pulled_created?: number;
    pulled_updated?: number;
    pushed_created?: number;
    pushed_updated?: number;
    conflicts?: number;
    errors?: number;
    limitations?: string[];
  } | null;
  last_error: string | null;
}

export interface CrmLogRow {
  id: number;
  provider: SyncProvider;
  entity: "company" | "contact" | "deal";
  direction: "pull" | "push";
  action: "created" | "updated" | "skipped" | "conflict" | "error";
  local_id: string | null;
  external_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface CrmStatus {
  connections: CrmConnection[];
  tokens: Record<SyncProvider, boolean>;
  log: CrmLogRow[];
}

export function useCrmStatus(accountId: string, enabled = true) {
  return useQuery({
    queryKey: gestaoKeys.crm(accountId),
    queryFn: () => callApi<CrmStatus>("/api/gestao", { accountId, action: "crm.status" }),
    enabled,
    refetchInterval: (q) =>
      q.state.data?.connections.some((c) => c.status === "connected") ? 30_000 : false,
  });
}

export function useCrmAction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      action:
        "crm.save" | "crm.test" | "crm.sync_now" | "crm.pause" | "crm.resume" | "crm.disconnect";
      provider: SyncProvider;
      token?: string;
      direction?: "both" | "pull" | "push";
      pipelineId?: string | null;
    }) => callApi<{ ok: true; message?: string }>("/api/gestao", { accountId, ...input }),
    onSettled: () => qc.invalidateQueries({ queryKey: gestaoKeys.crm(accountId) }),
  });
}

// ───────────────────────── modelos por segmento ─────────────────────────
export interface AppliedTemplate {
  area: string;
  template_key: string;
  applied_at: string;
  payload: Json;
}

export function useAppliedTemplates(accountId: string) {
  return useQuery({
    queryKey: gestaoKeys.templates(accountId),
    queryFn: async (): Promise<AppliedTemplate[]> => {
      const { data, error } = await supabase
        .from("account_templates")
        .select("area, template_key, applied_at, payload")
        .eq("account_id", accountId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useApplySegmentTemplate(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: SegmentKey) => {
      const t = segmentTemplate(key);
      if (!t) throw new Error("Modelo desconhecido");
      const { data, error } = await supabase.rpc("apply_segment_template", {
        _account: accountId,
        _key: key,
        _model: t.model as unknown as Json,
      });
      if (error) throw error;
      return data as {
        pipelines: number;
        stages: number;
        fields: number;
        macros: number;
        cadences: number;
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gestaoKeys.templates(accountId) });
      void qc.invalidateQueries({ queryKey: ["pipelines", accountId] });
      void qc.invalidateQueries({ queryKey: ["custom-fields", accountId] });
      void qc.invalidateQueries({ queryKey: ["automations", accountId] });
    },
  });
}
