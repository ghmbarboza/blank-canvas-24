import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { BrandIcon, BrandTile } from "@/components/brand/BrandIcon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { useIntegrations, useUseBundledAi, type Integration, type IntegrationsState } from "./api";
import { AiBudgetField } from "./AiBudgetField";
import { AiKeyForm } from "./IntegrationForms";

function IntegrationStatus({ integration }: { integration: Integration | undefined }) {
  if (!integration) return <span className="text-[12px] text-subtle">Não configurado</span>;
  const ok = integration.status === "connected";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium",
        ok ? "text-foreground" : "text-danger",
      )}
    >
      <span className={cn("size-2 rounded-full", ok ? "bg-success" : "bg-danger")} aria-hidden />
      {ok ? "Conectado" : integration.status === "pending" ? "Pendente" : "Com erro"}
    </span>
  );
}

interface CardProps {
  icon: LucideIcon;
  /** Marca da ferramenta: mostra o logo oficial no lugar do ícone. */
  brand?: string;
  title: string;
  description: string;
  integration?: Integration | undefined;
  showStatus?: boolean;
  children: ReactNode;
}

function IntegrationCard({
  icon: Icon,
  brand,
  title,
  description,
  integration,
  showStatus = true,
  children,
}: CardProps) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <header className="flex items-start gap-3">
        {brand ? (
          <BrandTile id={brand} size={36} />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2">
            <Icon className="size-4 text-foreground" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[14px] font-medium">{title}</h3>
            {showStatus && <IntegrationStatus integration={integration} />}
          </div>
          <p className="text-[13px] text-muted-foreground">{description}</p>
        </div>
      </header>
      {integration?.status === "error" && integration.lastError && (
        <p className="rounded-lg border border-hot-line bg-hot-soft px-3 py-2 text-[12px] text-hot-fg">
          {integration.lastError}
        </p>
      )}
      {children}
    </article>
  );
}

type AiChoice = "bundled" | "openai" | "anthropic";

function AiCard({ accountId, state }: { accountId: string; state: IntegrationsState | undefined }) {
  const { current } = useAccount();
  const savedProvider = current?.settings.ai?.provider;
  const saved: AiChoice =
    savedProvider === "openai" || savedProvider === "anthropic" ? savedProvider : "bundled";
  const [choice, setChoice] = useState<AiChoice>(saved);
  const bundled = useUseBundledAi(accountId);

  function pick(value: string) {
    const next = value === "openai" || value === "anthropic" ? value : "bundled";
    setChoice(next);
    if (next === "bundled" && saved !== "bundled") {
      bundled.mutate(undefined, {
        onSuccess: () => toast.success("Voltamos para a IA inclusa"),
        onError: (err) => toast.error(errorMessage(err)),
      });
    }
  }

  const options: { value: AiChoice; label: string; hint: string }[] = [
    {
      value: "bundled",
      label: "IA inclusa",
      hint: "Sem configurar nada. Já vem no plano.",
    },
    { value: "openai", label: "OpenAI", hint: "Usa a sua chave e a sua cota." },
    { value: "anthropic", label: "Anthropic", hint: "Usa a sua chave e a sua cota." },
  ];

  return (
    <IntegrationCard
      icon={Bot}
      title="IA própria"
      description={`Quem classifica leads e sugere respostas. Em uso agora: ${options.find((o) => o.value === saved)?.label ?? "IA inclusa"}.`}
      integration={choice === "bundled" ? undefined : state?.byProvider[choice]}
      showStatus={choice !== "bundled"}
    >
      <RadioGroup
        value={choice}
        onValueChange={pick}
        className="grid gap-2 sm:grid-cols-3"
        aria-label="Provedor de IA"
      >
        {options.map((o) => (
          <Label
            key={o.value}
            htmlFor={`ai-${o.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-surface-2",
              choice === o.value && "border-primary-line bg-primary-soft",
            )}
          >
            <RadioGroupItem id={`ai-${o.value}`} value={o.value} className="mt-0.5" />
            {o.value !== "bundled" ? <BrandIcon id={o.value} size={18} className="mt-0.5" /> : null}
            <span>
              <span className="block text-[13px] font-medium">{o.label}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">{o.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {bundled.isPending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />
      )}
      {choice !== "bundled" && (
        <AiKeyForm
          key={choice}
          accountId={accountId}
          state={state}
          provider={choice}
          model={saved === choice ? (current?.settings.ai?.model ?? "") : ""}
        />
      )}
      <AiBudgetField accountId={accountId} />
    </IntegrationCard>
  );
}

/** Escolha da IA (inclusa ou chave própria), mostrada em Ajustes › Integrações. */
export function AiChoiceCard({ accountId }: { accountId: string }) {
  const integrations = useIntegrations(accountId, true);
  if (integrations.isLoading)
    return (
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando IA" />
    );
  return <AiCard accountId={accountId} state={integrations.data} />;
}

/**
 * Em Canais só fica o apontamento: a chave da Zernio é pedida num lugar só (passo 1 do WhatsApp
 * Oficial) e as outras chaves (IA própria, e-mail, telefonia) ficam em Ajustes › Integrações.
 */
export function IntegrationsSection({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section aria-labelledby="integrations-heading" className="space-y-3">
      <h2
        id="integrations-heading"
        className="text-[11px] font-medium tracking-widest text-subtle uppercase"
      >
        Chaves das ferramentas
      </h2>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <BrandTile id="zernio" size={36} />
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          A chave da Zernio fica no{" "}
          <a
            href="#whatsapp-oficial"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            passo 1 do WhatsApp Oficial
          </a>
          . As outras (IA própria, e-mail, telefonia, reuniões) ficam em Ajustes › Integrações, no
          cofre da conta.
        </p>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/ajustes" search={{ aba: "integracoes" }}>
              Abrir Integrações
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
