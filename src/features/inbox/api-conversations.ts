import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/functions";
import { inboxKeys } from "./keys";
import type { Channel, ContactSummary, Conversation, InboxItem, Member } from "./types";
import { CHANNEL_CLIENT_COLUMNS } from "./types";

// Paginação por cursor: a lista abre com as 200 conversas mais recentes (por last_message_at) e
// "Carregar mais antigas" acrescenta a página seguinte. O recarregamento (realtime) refaz a busca com
// o mesmo tamanho já carregado, então nada some e a conversa nova continua no topo.
export const CONVERSATION_LIMIT = 200;
export const CONVERSATION_PAGE = 200;

async function fetchContacts(
  accountId: string,
  ids: string[],
): Promise<Map<string, ContactSummary>> {
  const map = new Map<string, ContactSummary>();
  if (!ids.length) return map;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, avatar_url, score, temperature, phone")
    .eq("account_id", accountId)
    .in("id", ids);
  if (error) throw error;
  for (const c of data ?? []) map.set(c.id, c);
  return map;
}

async function withContacts(accountId: string, rows: Conversation[]): Promise<InboxItem[]> {
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((id): id is string => !!id))];
  const contacts = await fetchContacts(accountId, contactIds);
  return rows.map((conversation) => ({
    conversation,
    contact: conversation.contact_id ? (contacts.get(conversation.contact_id) ?? null) : null,
  }));
}

export function useConversations(accountId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: inboxKeys.conversations(accountId),
    queryFn: async (): Promise<InboxItem[]> => {
      const loaded =
        queryClient.getQueryData<InboxItem[]>(inboxKeys.conversations(accountId))?.length ?? 0;
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("account_id", accountId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(Math.max(CONVERSATION_LIMIT, loaded));
      if (error) throw error;
      return withContacts(accountId, data ?? []);
    },
  });
}

// Próxima página: conversas mais antigas que a última carregada (cursor por last_message_at).
export function useLoadOlderConversations(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ added: number; hasMore: boolean }> => {
      const key = inboxKeys.conversations(accountId);
      const current = queryClient.getQueryData<InboxItem[]>(key) ?? [];
      const last = current[current.length - 1]?.conversation;
      let q = supabase
        .from("conversations")
        .select("*")
        .eq("account_id", accountId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(CONVERSATION_PAGE);
      if (last?.last_message_at)
        q = q.or(`last_message_at.lt.${last.last_message_at},last_message_at.is.null`);
      else if (last) q = q.is("last_message_at", null).gt("id", last.id);
      const { data, error } = await q;
      if (error) throw error;
      const known = new Set(current.map((i) => i.conversation.id));
      const fresh = (data ?? []).filter((r) => !known.has(r.id));
      const items = await withContacts(accountId, fresh);
      queryClient.setQueryData<InboxItem[]>(key, (prev) => [...(prev ?? []), ...items]);
      return { added: items.length, hasMore: (data ?? []).length === CONVERSATION_PAGE };
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

function patchConversation(
  queryClient: QueryClient,
  accountId: string,
  row: Conversation,
): boolean {
  let found = false;
  queryClient.setQueryData<InboxItem[]>(inboxKeys.conversations(accountId), (prev) =>
    prev?.map((item) => {
      if (item.conversation.id !== row.id) return item;
      found = true;
      return { ...item, conversation: row };
    }),
  );
  queryClient.setQueryData<Conversation>(inboxKeys.conversation(accountId, row.id), (prev) =>
    prev ? row : prev,
  );
  return found;
}

// Realtime: atualização de conversa conhecida é aplicada no cache; conversa nova recarrega a lista.
export function useConversationsRealtime(accountId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-conversations-${accountId}-${crypto.randomUUID()}`)
      .on<Conversation>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `account_id=eq.${accountId}`,
        },
        (payload: RealtimePostgresChangesPayload<Conversation>) => {
          if (
            payload.eventType === "UPDATE" &&
            patchConversation(queryClient, accountId, payload.new)
          ) {
            return;
          }
          void queryClient.invalidateQueries({ queryKey: inboxKeys.conversations(accountId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, queryClient]);
}

export function useConversation(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: inboxKeys.conversation(accountId, conversationId),
    placeholderData: () =>
      queryClient
        .getQueryData<InboxItem[]>(inboxKeys.conversations(accountId))
        ?.find((i) => i.conversation.id === conversationId)?.conversation,
    queryFn: async (): Promise<Conversation | null> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useChannels(accountId: string) {
  return useQuery({
    queryKey: inboxKeys.channels(accountId),
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select(CHANNEL_CLIENT_COLUMNS)
        .eq("account_id", accountId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMembers(accountId: string) {
  return useQuery({
    queryKey: inboxKeys.members(accountId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Member[]> => {
      const { data: rows, error } = await supabase
        .from("memberships")
        .select("user_id, display_name")
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
            name: r.display_name || p?.full_name || "Membro da equipe",
            avatarUrl: p?.avatar_url ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });
}

export function useMarkConversationRead(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc("mark_conversation_read", {
        _conversation: conversationId,
      });
      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      queryClient.setQueryData<InboxItem[]>(inboxKeys.conversations(accountId), (prev) =>
        prev?.map((i) =>
          i.conversation.id === conversationId
            ? { ...i, conversation: { ...i.conversation, unread_count: 0 } }
            : i,
        ),
      );
    },
  });
}

type ConversationPatch = Pick<
  TablesUpdate<"conversations">,
  | "status"
  | "assignee_user_id"
  | "snoozed_until"
  | "ai_handoff_at"
  | "ai_handoff_reason"
  | "ai_enabled"
  | "tags"
>;

export function useUpdateConversation(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ patch }: { patch: ConversationPatch; success: string }) => {
      const { data, error } = await supabase
        .from("conversations")
        .update(patch)
        .eq("account_id", accountId)
        .eq("id", conversationId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row, { success }) => {
      queryClient.setQueryData(inboxKeys.conversation(accountId, conversationId), row);
      patchConversation(queryClient, accountId, row);
      toast.success(success);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
