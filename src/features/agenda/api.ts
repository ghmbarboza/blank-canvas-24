import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAccount, useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { fromWall, toWall } from "./tz";
import type {
  AgendaEvent,
  EventContact,
  EventDeal,
  EventRow,
  EventStatus,
  Member,
  WallRange,
} from "./types";

const CONTACT_COLUMNS = "id, name, company, avatar_url, source, temperature, score";
const DEAL_COLUMNS = "id, title, value, status";

export function useAccountTimezone(): string {
  const { current } = useAccount();
  return current?.timezone ?? "America/Sao_Paulo";
}

// Resolve contato e negócio de cada evento em duas consultas (sem N+1) e converte para o fuso.
async function enrich(
  accountId: string,
  rows: EventRow[],
  timeZone: string,
): Promise<AgendaEvent[]> {
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((v): v is string => !!v))];
  const dealIds = [...new Set(rows.map((r) => r.deal_id).filter((v): v is string => !!v))];
  const [contactsRes, dealsRes] = await Promise.all([
    contactIds.length
      ? supabase
          .from("contacts")
          .select(CONTACT_COLUMNS)
          .eq("account_id", accountId)
          .in("id", contactIds)
      : Promise.resolve({ data: [] as EventContact[], error: null }),
    dealIds.length
      ? supabase.from("deals").select(DEAL_COLUMNS).eq("account_id", accountId).in("id", dealIds)
      : Promise.resolve({ data: [] as EventDeal[], error: null }),
  ]);
  if (contactsRes.error) throw contactsRes.error;
  if (dealsRes.error) throw dealsRes.error;
  const contacts = new Map((contactsRes.data ?? []).map((c) => [c.id, c]));
  const deals = new Map((dealsRes.data ?? []).map((d) => [d.id, d]));
  return rows.map((row) => ({
    row,
    start: toWall(row.starts_at, timeZone),
    end: toWall(row.ends_at, timeZone),
    contact: row.contact_id ? (contacts.get(row.contact_id) ?? null) : null,
    deal: row.deal_id ? (deals.get(row.deal_id) ?? null) : null,
  }));
}

export function useEvents(range: WallRange) {
  const accountId = useAccountId();
  const timeZone = useAccountTimezone();
  const from = fromWall(range.start, timeZone).toISOString();
  const to = fromWall(range.end, timeZone).toISOString();
  return useQuery({
    queryKey: ["events", accountId, "range", from, to],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("account_id", accountId)
        .lt("starts_at", to)
        .gt("ends_at", from)
        .order("starts_at")
        .limit(1000);
      if (error) throw error;
      return enrich(accountId, data ?? [], timeZone);
    },
  });
}

// ownerId filtra "Só meus" no banco; null traz a agenda da equipe.
export function useUpcomingEvents(ownerId: string | null, limit = 8) {
  const accountId = useAccountId();
  const timeZone = useAccountTimezone();
  return useQuery({
    queryKey: ["events", accountId, "upcoming", ownerId, limit],
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select("*")
        .eq("account_id", accountId)
        .gte("ends_at", new Date().toISOString())
        .in("status", ["scheduled", "confirmed"])
        .order("starts_at")
        .limit(limit);
      if (ownerId) query = query.eq("owner_user_id", ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return enrich(accountId, data ?? [], timeZone);
    },
  });
}

export function useMembers() {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["members", accountId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, display_name")
        .eq("account_id", accountId)
        .eq("is_active", true);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      const { data: profiles, error: pErr } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [], error: null };
      if (pErr) throw pErr;
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (data ?? [])
        .map((m) => ({
          userId: m.user_id,
          name: m.display_name ?? names.get(m.user_id) ?? "Membro da equipe",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });
}

export function useContactSearch(term: string) {
  const accountId = useAccountId();
  const q = term.trim();
  return useQuery({
    queryKey: ["contacts", accountId, "search", q],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EventContact[]> => {
      let query = supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("account_id", accountId)
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(8);
      if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContactById(contactId: string | null) {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["contacts", accountId, "one", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<EventContact | null> => {
      const { data, error } = await supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("account_id", accountId)
        .eq("id", contactId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useContactDeals(contactId: string | null) {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["deals", accountId, "contact", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<EventDeal[]> => {
      const { data, error } = await supabase
        .from("deals")
        .select(DEAL_COLUMNS)
        .eq("account_id", accountId)
        .eq("contact_id", contactId ?? "")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useInvalidateEvents() {
  const accountId = useAccountId();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["events", accountId] });
    void qc.invalidateQueries({ queryKey: ["dashboard", accountId] });
  };
}

export type EventInput = Omit<TablesInsert<"events">, "account_id" | "id">;

export function useSaveEvent() {
  const accountId = useAccountId();
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: EventInput }) => {
      if (id) {
        const patch: TablesUpdate<"events"> = input;
        const { error } = await supabase
          .from("events")
          .update(patch)
          .eq("id", id)
          .eq("account_id", accountId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("events").insert({ ...input, account_id: accountId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Evento atualizado" : "Evento criado");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

const STATUS_TOAST: Record<EventStatus, string> = {
  scheduled: "Evento reaberto",
  confirmed: "Evento confirmado",
  done: "Marcado como feito",
  canceled: "Evento cancelado",
  no_show: "Marcado como não compareceu",
};

export function useSetEventStatus() {
  const accountId = useAccountId();
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EventStatus }) => {
      const { error } = await supabase
        .from("events")
        .update({ status })
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(STATUS_TOAST[vars.status]);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// Conversa mais recente do contato, para o botão "Abrir conversa".
export function useLatestConversation() {
  const accountId = useAccountId();
  return useMutation({
    mutationFn: async (contactId: string): Promise<string | null> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// Arrastar evento na grade: só muda início e fim (instantes reais).
export function useMoveEvent() {
  const accountId = useAccountId();
  const timeZone = useAccountTimezone();
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async ({ id, start, end }: { id: string; start: Date; end: Date }) => {
      const { error } = await supabase
        .from("events")
        .update({
          starts_at: fromWall(start, timeZone).toISOString(),
          ends_at: fromWall(end, timeZone).toISOString(),
        })
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento remarcado");
      invalidate();
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      invalidate();
    },
  });
}

export interface EventMeeting {
  id: string;
  status: string;
  briefing: unknown;
}

// Sala Central de CS ligada ao evento (se houver) e o briefing que a IA prepara antes da reunião.
export function useEventMeeting(eventId: string | null) {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["meeting-of-event", eventId, "briefing"],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<EventMeeting | null> => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, status, briefing")
        .eq("account_id", accountId)
        .eq("event_id", eventId!)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
