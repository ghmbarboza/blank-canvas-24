import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LayoutTemplate, Loader2, Mail, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIntegration } from "@/features/integrations/api";
import { useAccount } from "@/lib/account";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCampaigns, useEmailHealth, useSaveCampaign, type EmailHealth } from "./api";
import { CampaignQuickStart } from "./CampaignQuickStart";
import { pct } from "./pct";
import { CampaignRow } from "./CampaignRow";
import { matchesScope, SCOPES, type Scope } from "./campaign-list";

// Campanhas de e-mail: frase para começar, saúde do domínio e a lista com números de verdade.
export function CampaignsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const navigate = useNavigate();
  const campaigns = useCampaigns(accountId);
  const health = useEmailHealth(accountId, isManager);
  const resend = useIntegration(accountId, "resend");
  const create = useSaveCampaign(accountId);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const list = campaigns.data ?? [];
  const term = query.trim().toLowerCase();
  const visible = list.filter(
    (c) =>
      matchesScope(c.status, scope) &&
      (!term || `${c.name} ${c.subject}`.toLowerCase().includes(term)),
  );

  async function newCampaign() {
    try {
      const c = await create.mutateAsync({ values: { name: "Nova campanha" } });
      void navigate({ to: "/campanhas/$campaignId/editar", params: { campaignId: c.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Campanhas"
        description="Fale com a base inteira por e-mail e acompanhe quem abriu e clicou."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/campanhas/whatsapp">WhatsApp</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/campanhas/modelos" aria-label="Modelos de e-mail">
                <LayoutTemplate /> <span className="hidden sm:inline">Modelos</span>
              </Link>
            </Button>
            {isManager && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void newCampaign()}
                disabled={create.isPending}
                aria-label="Nova campanha em branco"
              >
                {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                <span className="hidden sm:inline">Em branco</span>
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
          {resend.data && resend.data.status !== "connected" && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-note-line bg-note px-4 py-3 text-[13px] text-note-fg">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                Para enviar, conecte o Resend e verifique o domínio de envio.
              </span>
              <Button size="sm" variant="outline" asChild>
                <Link to="/ajustes" search={{ aba: "integracoes" }}>
                  Conectar Resend
                </Link>
              </Button>
            </div>
          )}

          {isManager && <CampaignQuickStart accountId={accountId} />}

          {isManager && health.data && health.data.sent > 0 && <HealthStrip h={health.data} />}

          <section aria-labelledby="campaign-list-title" className="space-y-4">
            <h2 id="campaign-list-title" className="sr-only">
              Suas campanhas
            </h2>
            {list.length > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  role="radiogroup"
                  aria-label="Mostrar campanhas"
                  className="flex flex-wrap gap-1.5"
                >
                  {SCOPES.map(([k, label]) => {
                    const active = scope === k;
                    const n = list.filter((c) => matchesScope(c.status, k)).length;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setScope(k)}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-[background-color,color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
                          active
                            ? "border-primary bg-primary-soft text-foreground"
                            : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                        )}
                      >
                        {label}
                        {k !== "all" && n > 0 && (
                          <span
                            className={cn(
                              "tabular-nums",
                              active ? "text-muted-foreground" : "text-subtle",
                            )}
                          >
                            {n}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar campanha"
                    aria-label="Buscar campanha pelo nome ou assunto"
                    className="h-9 pl-9"
                  />
                </div>
              </div>
            )}

            {campaigns.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : campaigns.isError ? (
              <p className="rounded-2xl border border-danger/40 px-4 py-6 text-center text-[13px] text-danger">
                {errorMessage(campaigns.error)}
              </p>
            ) : list.length === 0 ? (
              <EmptyState
                icon={Mail}
                className="rounded-[24px] border border-dashed border-border"
                title="Nenhuma campanha ainda"
                description={
                  isManager
                    ? "Use a frase acima: escolha o público e o modelo, revise o conteúdo, envie um teste para você e dispare. O descadastro e o ritmo de envio ficam por nossa conta."
                    : "Quando um gestor criar uma campanha, ela aparece aqui com envios, aberturas e cliques."
                }
              />
            ) : visible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
                Nenhuma campanha com esse filtro.{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2"
                  onClick={() => {
                    setScope("all");
                    setQuery("");
                  }}
                >
                  Mostrar todas
                </button>
              </p>
            ) : (
              <div className="overflow-hidden rounded-[24px] border border-border bg-surface">
                <div className="hidden grid-cols-[minmax(0,4fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)] gap-4 border-b border-border bg-surface-2/60 px-6 py-3 text-[11px] font-semibold tracking-[0.12em] text-subtle uppercase lg:grid">
                  <span>Campanha</span>
                  <span>Status</span>
                  <span>Público</span>
                  <span>Engajamento</span>
                </div>
                <ul className="divide-y divide-border">
                  {visible.map((c) => (
                    <CampaignRow key={c.id} c={c} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Saúde dos envios em 30 dias: o que o provedor olha para decidir se seu e-mail chega.
function HealthStrip({ h }: { h: EmailHealth }) {
  const items = [
    { label: "Enviados", value: formatNumber(h.sent), hint: "últimos 30 dias" },
    { label: "Abertura", value: pct(h.openRate), hint: "de quem recebeu" },
    { label: "Clique", value: pct(h.clickRate), hint: "de quem recebeu" },
    {
      label: "Voltaram",
      value: pct(h.bounceRate),
      hint: "endereço inválido · limite 5%",
      level: h.bounceLevel,
    },
    {
      label: "Marcado como spam",
      value: pct(h.spamRate, 2),
      hint: "alerta 0,1% · teto 0,3%",
      level: h.spamLevel,
    },
  ];
  return (
    <section aria-label="Saúde dos envios nos últimos 30 dias">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-0 lg:divide-x lg:divide-border">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 lg:px-6 lg:first:pl-0 lg:last:pr-0">
            <dt className="text-[11px] text-subtle">{it.label}</dt>
            <dd
              className={cn(
                "font-display text-[26px] leading-tight font-semibold tabular-nums",
                it.level === "bad" && "text-danger",
              )}
            >
              {it.value}
            </dd>
            <dd
              className={cn(
                "truncate text-[11px]",
                it.level === "bad" || it.level === "warn" ? "text-danger" : "text-subtle",
              )}
              title={it.hint}
            >
              {it.hint}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
