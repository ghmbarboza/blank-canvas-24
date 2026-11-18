import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

export type Meeting = Tables<"meetings">;
export type MeetingTranscript = Tables<"meeting_transcripts">;
export type CoachTipRow = Tables<"coach_tips">;

export const meetingKeys = {
  all: (accountId: string) => ["meetings", accountId] as const,
  one: (id: string) => ["meeting", id] as const,
  transcript: (id: string) => ["meeting-transcript", id] as const,
  tips: (id: string) => ["coach-tips", id] as const,
};

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "Marcada",
  live: "Ao vivo",
  ended: "Realizada",
  canceled: "Cancelada",
  no_show: "Não compareceu",
};

export interface MeetingListRow extends Meeting {
  contact: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    company: string | null;
  } | null;
  playbook: { name: string } | null;
}

export function useMeetings(accountId: string) {
  return useQuery({
    queryKey: meetingKeys.all(accountId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<MeetingListRow[]> => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*, contact:contacts(id, name, avatar_url, company), playbook:playbooks(name)")
        .eq("account_id", accountId)
        .order("scheduled_start", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as MeetingListRow[];
    },
  });
}

export function useMeeting(meetingId: string) {
  return useQuery({
    queryKey: meetingKeys.one(meetingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select(
          "*, contact:contacts(id, name, email, phone, avatar_url, company), deal:deals(id, title, value), playbook:playbooks(name)",
        )
        .eq("id", meetingId)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (Meeting & {
            contact: {
              id: string;
              name: string | null;
              email: string | null;
              phone: string | null;
              avatar_url: string | null;
              company: string | null;
            } | null;
            deal: { id: string; title: string; value: number } | null;
            playbook: { name: string } | null;
          })
        | null;
    },
  });
}

export function useMeetingExtras(meetingId: string) {
  return useQuery({
    queryKey: [...meetingKeys.one(meetingId), "extras"],
    queryFn: async () => {
      const [participants, invites] = await Promise.all([
        supabase
          .from("meeting_participants")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("created_at"),
        supabase
          .from("meeting_invites")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("created_at", { ascending: false }),
      ]);
      return { participants: participants.data ?? [], invites: invites.data ?? [] };
    },
  });
}

/** Transcrição ao vivo: carrega o que já existe e acompanha por realtime. */
export function useTranscript(meetingId: string, live: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: meetingKeys.transcript(meetingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_transcripts")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("id")
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!live) return;
    const ch = supabase
      .channel(`transcript-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_transcripts",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) =>
          qc.setQueryData<MeetingTranscript[]>(meetingKeys.transcript(meetingId), (prev) => [
            ...(prev ?? []),
            payload.new as MeetingTranscript,
          ]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [meetingId, live, qc]);
  return q;
}

/** Dicas do coach gravadas no banco (reserva do data channel), em tempo real. */
export function useCoachTips(meetingId: string, enabled: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: meetingKeys.tips(meetingId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_tips")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`tips-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "coach_tips",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) =>
          qc.setQueryData<CoachTipRow[]>(meetingKeys.tips(meetingId), (prev) => [
            payload.new as CoachTipRow,
            ...(prev ?? []),
          ]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [meetingId, enabled, qc]);
  return q;
}

export function useDismissTip(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coach_tips").update({ dismissed: true }).eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) =>
      qc.setQueryData<CoachTipRow[]>(meetingKeys.tips(meetingId), (prev) =>
        (prev ?? []).map((t) => (t.id === id ? { ...t, dismissed: true } : t)),
      ),
  });
}

export interface CreateMeetingInput {
  title?: string;
  contactId?: string | null;
  dealId?: string | null;
  eventId?: string | null;
  start?: string | null;
  durationMin?: number;
  sendInvite?: boolean;
  requireAdmit?: boolean;
}

export function useCreateMeeting(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeetingInput) =>
      callApi<{ meeting: Meeting; hostUrl: string; guestUrl: string | null }>("/api/meetings", {
        accountId,
        action: "create",
        ...input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meetingKeys.all(accountId) });
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function meetingAction<T = { ok: true }>(
  accountId: string,
  meetingId: string,
  action: "invite" | "guest_link" | "cancel" | "end" | "minutes" | "admit" | "delete_recording",
  extra: Record<string, unknown> = {},
) {
  return callApi<T>("/api/meetings", { accountId, meetingId, action, ...extra });
}
