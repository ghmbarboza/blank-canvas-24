import { useEffect, useState, type FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage, fieldErrors, newPassword, type FieldErrors } from "@/lib/authentication";
import { pageHead } from "@/lib/page-head";
import { AuthStage } from "@/components/layout/AuthStage";
import { Wordmark } from "@/components/layout/Logo";
import { FieldError } from "@/components/common/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => pageHead("Criar senha nova", "Crie uma senha nova para entrar no Nexus One."),
  component: ResetPassword,
});

// Quanto esperar o link do e-mail virar sessão antes de dizer que ele não vale mais.
const RECOVERY_WAIT_MS = 4000;

type Phase = "checking" | "ready" | "invalid" | "done";

function ResetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let active = true;
    // O link do e-mail entra com o token na URL; o cliente do Supabase troca por uma sessão
    // de recuperação e avisa com PASSWORD_RECOVERY (ou já devolve a sessão).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) setPhase("ready");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setPhase("ready");
    });
    const timer = window.setTimeout(() => {
      if (active) setPhase((p) => (p === "checking" ? "invalid" : p));
    }, RECOVERY_WAIT_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = newPassword.safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) throw error;
      setPhase("done");
      await navigate({ to: "/painel", replace: true });
    } catch (err) {
      setErrors({ form: authErrorMessage(err instanceof Error ? err.message : "") });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_minmax(0,560px)]">
      <AuthStage />
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
            Acesso
          </p>
          <h1 className="font-display text-3xl font-medium">Criar senha nova.</h1>
          {phase === "checking" ? (
            <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Conferindo o link do e-mail…
            </p>
          ) : phase === "invalid" ? (
            <div role="status" className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Este link não vale mais: ele expira depois de um tempo e só funciona uma vez. Peça
                um link novo na tela de entrar, em “Esqueci minha senha”.
              </p>
              <Button asChild className="w-full">
                <Link to="/entrar">Pedir um link novo</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Use pelo menos 8 caracteres. Depois você entra direto no Painel.
              </p>
              <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
                {errors.form ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
                  >
                    {errors.form}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha nova</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Mínimo de 8 caracteres"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                  />
                  <FieldError id="password-error" message={errors.password} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Repita a senha nova</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    aria-invalid={Boolean(errors.confirm)}
                    aria-describedby={errors.confirm ? "confirm-error" : undefined}
                  />
                  <FieldError id="confirm-error" message={errors.confirm} />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={pending || phase === "done"}
                >
                  {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                  Salvar senha e entrar
                </Button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
