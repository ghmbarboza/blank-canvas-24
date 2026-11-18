import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type AuthState } from "@/lib/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Assina antes de ler a sessão para não perder o evento do login por link.
    let active = true;
    let revision = 0;
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      revision += 1;
      setSession(next);
      setLoading(false);
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      void router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    const initialRevision = revision;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: userData, error } = await supabase.auth.getUser();
      if (!active || revision !== initialRevision) return;
      setSession(!error && userData.user ? sessionData.session : null);
      setLoading(false);
    })();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient, router]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      // scope local: sair aqui não derruba as sessões do usuário em outros aparelhos.
      signOut: async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
        await router.navigate({ to: "/entrar", replace: true });
      },
    }),
    [session, loading, queryClient, router],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
