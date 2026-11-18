import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

import type { Slot } from "./slots";

export type BookingPage = Tables<"booking_pages">;

export interface BookingQuestion {
  id: string;
  label: string;
  type: "text" | "long_text" | "select";
  required: boolean;
  options?: string[];
}

export const bookingKeys = { all: (accountId: string) => ["booking-pages", accountId] as const };

export function useBookingPages(accountId: string) {
  return useQuery({
    queryKey: bookingKeys.all(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_pages")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveBookingPage(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Omit<TablesInsert<"booking_pages">, "account_id">;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from("booking_pages")
          .update(input.values)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("booking_pages")
        .insert({ ...input.values, account_id: accountId, created_by: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all(accountId) }),
  });
}

export function useDeleteBookingPage(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("booking_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all(accountId) }),
  });
}

export interface BookingStats {
  /** Reuniões marcadas pelo link nos últimos 7 dias. */
  week: number;
  /** Reuniões marcadas pelo link que ainda vão acontecer. */
  upcoming: number;
}

const PAGE_SIZE = 1000;
const WEEK_MS = 7 * 86_400_000;

// Quantas reuniões cada link trouxe: lê só id do link, criação, início e status (paginado).
export function useBookingStats(accountId: string) {
  return useQuery({
    queryKey: [...bookingKeys.all(accountId), "stats"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, BookingStats>> => {
      const now = Date.now();
      const since = new Date(now - 60 * 86_400_000).toISOString();
      const rows: {
        booking_page_id: string | null;
        created_at: string;
        scheduled_start: string | null;
        status: string;
      }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("meetings")
          .select("booking_page_id, created_at, scheduled_start, status")
          .eq("account_id", accountId)
          .not("booking_page_id", "is", null)
          .or(`created_at.gte.${since},scheduled_start.gte.${new Date(now).toISOString()}`)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      const stats = new Map<string, BookingStats>();
      for (const r of rows) {
        if (!r.booking_page_id) continue;
        const cur = stats.get(r.booking_page_id) ?? { week: 0, upcoming: 0 };
        const created = Date.parse(r.created_at);
        const start = r.scheduled_start ? Date.parse(r.scheduled_start) : NaN;
        const canceled = r.status === "canceled";
        stats.set(r.booking_page_id, {
          week: cur.week + (now - created <= WEEK_MS ? 1 : 0),
          upcoming: cur.upcoming + (!canceled && start >= now ? 1 : 0),
        });
      }
      return stats;
    },
  });
}

// Quem já ligou a agenda do Google ou do Outlook (só gestor enxerga a equipe toda).
export function useConnectedCalendars(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["calendar-connections", accountId, "team"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("calendar_connections")
        .select("user_id, status")
        .eq("account_id", accountId);
      if (error) throw error;
      return new Set((data ?? []).filter((c) => c.status === "connected").map((c) => c.user_id));
    },
  });
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── rota pública (sem sessão) ──────────────────────────────────────────────
async function publicCall<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/public/booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(j?.error ?? `Falha (${res.status})`);
  return j as T;
}

export interface PublicPage {
  title: string;
  description: string | null;
  duration_min: number;
  questions: BookingQuestion[];
  location: string;
  location_detail: string | null;
  account_name: string;
  time_zone: string;
  host: { name: string | null; avatar_url: string | null } | null;
}

export function usePublicPage(slug: string) {
  return useQuery({
    queryKey: ["public-booking", slug],
    retry: false,
    queryFn: () => publicCall<PublicPage>({ action: "page", slug }),
  });
}

export function usePublicSlots(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["public-booking-slots", slug],
    enabled,
    refetchInterval: 60_000,
    queryFn: () => publicCall<{ slots: Slot[]; timeZone: string }>({ action: "slots", slug }),
  });
}

export interface BookResult {
  meetingId: string;
  start: string;
  end: string;
  timeZone: string;
  accountName: string;
  joinUrl: string | null;
  message: string | null;
}

export function bookSlot(body: Record<string, unknown>) {
  return publicCall<BookResult>({ action: "book", ...body });
}
