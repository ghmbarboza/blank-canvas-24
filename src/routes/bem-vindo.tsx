import { useEffect, useState, type FormEvent } from "react";
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { Logo } from "@/components/layout/Logo";
import { FullScreenLoader } from "@/components/layout/FullScreenLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/bem-vindo")({
  head: () => pageHead("Bem-vindo", "Configure seu perfil e sua empresa na Central de CS."),
  component: Welcome,
});

// Entrou sem central. Banco sem nenhuma conta (remix recém-criado): quem chega primeiro vira
// dono na hora (claim_first_account, garantido no banco) e vai direto para a Cris, que pergunta
// o nome da empresa na conversa. Banco que já tem dono: só por convite. No original de
// desenvolvimento (várias contas) o formulário abaixo continua criando conta nova.
function Welcome() {
  const { user, loading } = useAuth();
  const { current, loading: loadingAccount } = useAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [claim, setClaim] = useState<"trying" | "taken" | "done">("trying");

  useEffect(() => {
    if (!user || loadingAccount || current) return;
    let alive = true;
    const fullName = user.user_metadata?.["full_name"] as string | undefined;
    void supabase
      .rpc("claim_first_account", fullName ? { _full_name: fullName } : {})
      .then(async ({ data }) => {
        if (!alive) return;
        if (data) {
          await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
          setClaim("done");
          navigate({ to: "/painel", replace: true });
        } else setClaim("taken");
      });
    return () => {
      alive = false;
    };
  }, [user, loadingAccount, current, queryClient, navigate]);

  if (loading || (user && loadingAccount) || (user && !current && claim !== "taken"))
    return <FullScreenLoader />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (current) return <Navigate to="/painel" replace />;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const company = String(form.get("company") ?? "").trim();
    const fullName = String(form.get("fullName") ?? "").trim();
    if (company.length < 2) {
      toast.error("Informe o nome da empresa");
      return;
    }
    setPending(true);
    try {
      const { error } = await supabase.rpc("bootstrap_account", {
        _name: company,
        _full_name: fullName,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      toast.success("Central criada. A Cris vai configurar o resto com você.");
      // a configuração é a conversa com a Cris: ela abre sozinha logo depois
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <Logo className="size-10" />
        <h1 className="mt-6 font-display text-2xl font-medium">Vamos montar sua central</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Criamos sua empresa com um funil de vendas pronto. Você ajusta tudo depois.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Seu nome</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              defaultValue={user.user_metadata["full_name"] ?? user.user_metadata["name"] ?? ""}
              placeholder="Como a equipe te chama"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Nome da empresa</Label>
            <Input
              id="company"
              name="company"
              required
              minLength={2}
              autoComplete="organization"
              placeholder="Ex.: Studio Arquitetura"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            Criar minha central
          </Button>
        </form>
        <p className="mt-6 text-[12px] text-subtle">
          Recebeu um convite? Abra o link que te mandaram com esta mesma conta ({user.email}).
        </p>
      </div>
    </main>
  );
}
