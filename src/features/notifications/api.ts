import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export type Notification = Tables<"notifications">;

const key = (userId: string | undefined, accountId: string) => ["notifications", userId, accountId];

export function useNotifications(accountId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: key(user?.id, accountId),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}-${accountId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void qc.invalidateQueries({ queryKey: key(user.id, accountId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, accountId, qc]);
  return query;
}

export function useMarkNotificationsRead(accountId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[] | "all") => {
      let q = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .is("read_at", null);
      if (ids !== "all") q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(user?.id, accountId) }),
  });
}
