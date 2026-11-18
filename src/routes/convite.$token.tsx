import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ACCOUNT_QUERY_KEY } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { Logo } from "@/components/layout/Logo";
import { FullScreenLoader } from "@/components/layout/FullScreenLoader";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/convite/$token")({
  head: () => pageHead("Convite", "Aceite seu convite para participar de uma equipe no Nexus One."),
  component: Invite,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "administrador",
  manager: "gestor",
  agent: "atendente",
  seller: "vendedor",
};

function Invite() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("invite_preview", { _token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (loading || isLoading) return <FullScreenLoader />;

  async function accept() {
    setPending(true);
    try {
      const { error } = await supabase.rpc("accept_invite", { _token: token });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(msg.includes("another email") ? "Este convite é para outro e-mail" : msg);
    } finally {
      setPending(false);
    }
  }

  const invalid = !invite || invite.expired;
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <Logo className="mx-auto size-10" />
        {invalid ? (
          <>
            <h1 className="mt-6 font-display text-2xl font-medium">Convite indisponível</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">
              O link expirou ou já foi usado. Peça um novo convite a quem administra a conta.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mt-6 grid size-12 place-items-center rounded-2xl bg-primary-soft">
              <MailCheck className="size-5 text-primary" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-medium">
              Entrar em {invite.account_name}
            </h1>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Você foi convidado como {ROLE_LABEL[invite.role] ?? invite.role} ({invite.email}).
            </p>
            {user ? (
              <Button className="mt-8 w-full" size="lg" onClick={accept} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Aceitar convite
              </Button>
            ) : (
              <Button asChild className="mt-8 w-full" size="lg">
                <Link to="/entrar" search={{ redirect: `/convite/${token}` }}>
                  Entrar ou criar conta com {invite.email}
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
