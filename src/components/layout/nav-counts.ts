// Contadores vivos do menu e da tela inicial (mesma chave de cache: os dois mostram o mesmo número).
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const unreadQuery = (accountId: string) => ({
  queryKey: ["unread-total", accountId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("unread_count")
      .eq("account_id", accountId)
      .eq("status", "open")
      .gt("unread_count", 0);
    if (error) throw error;
    return (data ?? []).reduce((sum, r) => sum + r.unread_count, 0);
  },
});

/** Não lidas na caixa, com tempo real. Só o menu assina (um canal por aba). */
export function useUnreadCount(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(unreadQuery(accountId));
  useEffect(() => {
    const channel = supabase
      .channel(`unread-${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `account_id=eq.${accountId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["unread-total", accountId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, queryClient]);
  return query.data ?? 0;
}

/** O mesmo número, lido do cache que o menu mantém atualizado (sem abrir outro canal). */
export function useUnreadValue(accountId: string) {
  return useQuery(unreadQuery(accountId)).data ?? 0;
}

// Itens que já são meus (reservados, em atendimento ou em finalização): o que me espera agora.
export function useMyQueueCount(accountId: string, userId: string | undefined) {
  const query = useQuery({
    queryKey: ["nav-badge", "my-queue", accountId, userId ?? ""],
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("work_items")
        .select("id", { head: true, count: "exact" })
        .eq("account_id", accountId)
        .in("status", ["reserved", "assigned", "wrap_up"])
        .or(`assigned_user_id.eq.${userId},reserved_user_id.eq.${userId}`);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return query.data ?? 0;
}

// Incidente aberto acende o menu do gestor em vermelho: a operação está com problema agora.
export function useActiveIncidents(accountId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ["nav-badge", "incidents", accountId],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("incidents")
        .select("id", { head: true, count: "exact" })
        .eq("account_id", accountId)
        .neq("status", "resolved");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return query.data ?? 0;
}
