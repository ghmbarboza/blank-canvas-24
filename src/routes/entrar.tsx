import { useEffect, useState, type FormEvent } from "react";
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  authErrorMessage,
  credentials,
  fieldErrors,
  parseRegistration,
  confirmationRedirect,
  registrationOutcome,
  resetRequest,
  type FieldErrors,
} from "@/lib/authentication";
import { fetchAuthProviders, oauthErrorFromHash, type AuthProviders } from "@/lib/auth-setup";
import { AuthSetupNotice } from "@/features/auth-setup-notice";
import { useAuthDestination } from "@/hooks/use-auth-destination";
import { pageHead } from "@/lib/page-head";
import { useAuth } from "@/lib/auth";
import { AuthStage } from "@/components/layout/AuthStage";
import { Wordmark } from "@/components/layout/Logo";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { FieldError } from "@/components/common/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/entrar")({
  validateSearch: searchSchema,
  head: () =>
    pageHead(
      "Entrar",
      "Entre ou crie sua conta na Central de CS para acessar sua central de atendimento.",
    ),
  component: SignIn,
});

function SignIn() {
  const { user, loading } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [pending, setPending] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [resetSentTo, setResetSentTo] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  // Central que já tem dono: cadastro só pelo link de convite (signup_mode no banco).
  // null até o banco responder: sem isso piscava "Primeiro acesso? Você será o administrador."
  const [signupMode, setSignupMode] = useState<string | null>(null);
  // null = ainda não se sabe (ou não deu para ler): a tela segue normal
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAuthProviders(
      import.meta.env["VITE_SUPABASE_URL"] as string | undefined,
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined,
    ).then((found) => {
      if (alive) setProviders(found);
    });
    const oauthError = oauthErrorFromHash(window.location.hash);
    if (oauthError) {
      setErrors({ form: oauthError });
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown }>)(
      "signup_mode",
    ).then(({ data }) => {
      if (alive && typeof data === "string") setSignupMode(data);
    });
    return () => {
      alive = false;
    };
  }, []);
  const viaInvite = typeof redirect === "string" && redirect.startsWith("/convite/");
  const canSignUp = viaInvite || (signupMode !== null && signupMode !== "invite_only");

  function switchMode(next: "signin" | "signup" | "forgot") {
    setErrors({});
    setResetSentTo("");
    setMode(next);
  }

  // Só aceita redirecionar para rota interna.
  const { destination: target, ready } = useAuthDestination(redirect);
  if (user && ready) return <Navigate to={target} replace />;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (mode === "forgot") return requestReset(form);
    const parsed = credentials.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        navigate({ to: target, replace: true });
      } else {
        const registration = parseRegistration({ ...parsed.data, fullName: form.get("fullName") });
        window.sessionStorage.setItem("nexus-auth-destination", target);
        const { data, error } = await supabase.auth.signUp({
          ...registration,
          options: {
            ...registration.options,
            emailRedirectTo: confirmationRedirect(window.location.origin, target),
          },
        });
        if (error) throw error;
        if (registrationOutcome(data.session) === "confirmation-required")
          setConfirmationEmail(parsed.data.email);
        else navigate({ to: target, replace: true });
      }
    } catch (err) {
      if (err instanceof z.ZodError) setErrors(fieldErrors(err));
      else setErrors({ form: authErrorMessage(err instanceof Error ? err.message : "") });
    } finally {
      setPending(false);
    }
  }

  async function requestReset(form: FormData) {
    const parsed = resetRequest.safeParse({ email: form.get("email") });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      // Resposta neutra: não revela se o e-mail tem conta.
      if (error && /rate limit|too many/i.test(error.message))
        setErrors({ form: authErrorMessage(error.message) });
      else setResetSentTo(parsed.data.email);
    } finally {
      setPending(false);
    }
  }

  async function socialSignIn(provider: "google") {
    setPending(true);
    window.sessionStorage.setItem("nexus-auth-destination", target);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/entrar`,
      });
      if (result.error) throw result.error;
      if ("redirected" in result && result.redirected) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (data.user) await navigate({ to: target, replace: true });
    } catch {
      setErrors({
        form: "Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.",
      });
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
          <p className="mb-1.5 text-[11px] font-medium tracking-[0.16em] text-gold-text uppercase">
            Acesso
          </p>
          <h1 className="font-display text-3xl font-extrabold">
            {mode === "signin"
              ? "Entrar na sua conta."
              : mode === "signup"
                ? "Criar sua conta."
                : "Recuperar a senha."}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {mode === "signin"
              ? "Bom te ver de novo."
              : mode === "signup"
                ? "Leva menos de um minuto. Depois você conecta os canais."
                : "Informe o e-mail da sua conta. Enviamos um link para criar uma senha nova."}
          </p>
          {confirmationEmail ? (
            <div role="status" className="mt-8 space-y-4">
              <h3 className="font-medium">Confirme seu e-mail</h3>
              <p className="text-sm text-muted-foreground">
                Enviamos um link para {confirmationEmail}. Confirme seu endereço antes de entrar.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setConfirmationEmail("");
                  switchMode("signin");
                }}
              >
                Voltar para entrar
              </Button>
            </div>
          ) : resetSentTo ? (
            <div role="status" className="mt-8 space-y-4">
              <h3 className="font-medium">Confira seu e-mail</h3>
              <p className="text-sm text-muted-foreground">
                Se {resetSentTo} tiver conta na Central de CS, o link para criar uma senha nova chega em
                alguns minutos. Olhe também a caixa de spam.
              </p>
              <Button variant="outline" className="w-full" onClick={() => switchMode("signin")}>
                Voltar para entrar
              </Button>
            </div>
          ) : (
            <>
              {providers ? <AuthSetupNotice providers={providers} /> : null}
              <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
                {errors.form ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
                  >
                    {errors.form}
                  </p>
                ) : null}
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Seu nome</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      autoComplete="name"
                      required
                      maxLength={120}
                      disabled={pending}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? "fullName-error" : undefined}
                    />
                    <FieldError id="fullName-error" message={errors.fullName} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="voce@empresa.com.br"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  <FieldError id="email-error" message={errors.email} />
                </div>
                {mode !== "forgot" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      {mode === "signin" ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-[13px] font-medium"
                          onClick={() => switchMode("forgot")}
                        >
                          Esqueci minha senha
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      required
                      minLength={8}
                      placeholder="Mínimo de 8 caracteres"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? "password-error" : undefined}
                    />
                    <FieldError id="password-error" message={errors.password} />
                  </div>
                ) : null}
                <Button type="submit" className="w-full" size="lg" disabled={pending || loading}>
                  {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                  {mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
                </Button>
              </form>
              {mode !== "forgot" && providers?.google !== false ? (
                <div className="mt-5 space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={pending || loading}
                    onClick={() => socialSignIn("google")}
                  >
                    <BrandIcon id="google" size={16} />
                    Continuar com Google
                  </Button>
                </div>
              ) : null}
              {mode === "signin" && signupMode === null && !viaInvite ? (
                <p className="mt-6 h-5" aria-hidden />
              ) : mode === "signin" && !canSignUp ? (
                <p className="mt-6 text-center text-[13px] text-muted-foreground">
                  Acesso só por convite. Peça o link a quem administra a central.
                </p>
              ) : (
                <p className="mt-6 text-center text-[13px] text-muted-foreground">
                  {mode === "signin"
                    ? signupMode === "first_owner"
                      ? "Primeiro acesso? Você será o administrador."
                      : "Ainda não tem conta?"
                    : mode === "signup"
                      ? "Já tem conta?"
                      : "Lembrou a senha?"}{" "}
                  <Button
                    variant="link"
                    className="h-auto p-0 font-medium"
                    disabled={pending}
                    onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                  >
                    {mode === "signin" ? "Criar agora" : "Entrar"}
                  </Button>
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
