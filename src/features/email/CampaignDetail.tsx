import { Link } from "@tanstack/react-router";
import { ArrowLeft, Ban, Loader2, MousePointerClick, Pause, Play, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useCampaign, useCampaignAction, useCampaignInsights } from "./api";
import { CampaignStatusPill } from "./CampaignStatusPill";
import { pct } from "./pct";

// Resultado da campanha: funil enviado → entregue → aberto → clicado, cliques por botão e quem clicou.
export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const q = useCampaign(accountId, campaignId);
  const action = useCampaignAction(accountId, campaignId);
  const insights = useCampaignInsights(accountId, campaignId, Boolean(q.data));

  if (q.isPending) return <Skeleton className="m-6 h-96 rounded-[24px]" />;
  const c = q.data?.campaign;
  if (!c) return <p className="p-6 text-[13px] text-muted-foreground">Campanha não encontrada.</p>;
  const s = q.data!.stats;
  const sent = s?.sent ?? 0;
  const funnel = [
    { label: "Enviados", value: sent },
    { label: "Entregues", value: s?.delivered ?? 0 },
    { label: "Abriram", value: s?.opened ?? 0 },
    { label: "Clicaram", value: s?.clicked ?? 0 },
  ];
  const max = Math.max(1, c.audience_estimate ?? 0, sent);

  const run = (a: "campaign_pause" | "campaign_resume" | "campaign_cancel") =>
    action.mutate(
      { action: a },
      {
        onSuccess: () => toast.success("Campanha atualizada"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="ds-page-header px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
        <Link
          to="/campanhas"
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Campanhas
        </Link>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Campanha de e-mail
            </p>
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[26px] leading-tight font-medium text-foreground sm:text-[30px]">
                {c.name}
              </h1>
              <CampaignStatusPill status={c.status} />
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {c.subject} ·{" "}
              {c.status === "scheduled" && c.scheduled_at
                ? `agendada para ${formatDateTime(c.scheduled_at)}`
                : c.started_at
                  ? `disparada ${formatRelative(c.started_at)}`
                  : "não disparada"}
            </p>
          </div>
          {isManager && (
            <div className="flex gap-2">
              {(c.status === "sending" || c.status === "scheduled") && (
                <Button
                  variant="outline"
                  onClick={() => run("campaign_pause")}
                  disabled={action.isPending}
                >
                  <Pause /> Pausar
                </Button>
              )}
              {c.status === "paused" && (
                <Button onClick={() => run("campaign_resume")} disabled={action.isPending}>
                  <Play /> Retomar
                </Button>
              )}
              {["sending", "scheduled", "paused"].includes(c.status) && (
                <Button
                  variant="outline"
                  onClick={() => run("campaign_cancel")}
                  disabled={action.isPending}
                >
                  <Ban /> Cancelar
                </Button>
              )}
            </div>
          )}
        </div>
        {c.last_error && (
          <p className="mt-3 rounded-xl bg-note px-3 py-2 text-[12px] text-note-fg">
            {c.last_error}
          </p>
        )}
      </div>

      <div className="grid gap-6 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10">
        <section className="rounded-[24px] border border-border bg-surface p-5" aria-label="Funil">
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Funil do envio</p>
            {c.status === "sending" && (
              <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> enviando em lotes
              </span>
            )}
          </div>
          <ol className="space-y-3">
            {funnel.map((f, i) => (
              <li key={f.label}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{f.label}</span>
                  <span className="tabular-nums">
                    <b>{formatNumber(f.value)}</b>
                    {i > 0 && sent ? ` · ${pct(f.value / sent)}` : ""}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700"
                    style={{
                      width: `${Math.max(2, (f.value / max) * 100)}%`,
                      opacity: 1 - i * 0.18,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-[12px] sm:grid-cols-4">
            <Mini label="Público estimado" value={formatNumber(c.audience_estimate ?? 0)} />
            <Mini
              label="Pulados (sem e-mail, descadastro, teto)"
              value={formatNumber(s?.skipped ?? 0)}
            />
            <Mini label="Bounce" value={formatNumber(s?.bounced ?? 0)} />
            <Mini label="Spam" value={formatNumber(s?.complained ?? 0)} />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3 inline-flex items-center gap-1.5">
              <MousePointerClick className="size-3.5" /> Cliques por botão
            </p>
            {(insights.data?.ctas ?? []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Ninguém clicou ainda.</p>
            ) : (
              <ul className="space-y-2">
                {insights.data!.ctas.slice(0, 8).map((x) => (
                  <li key={x.label} className="flex justify-between gap-3 text-[13px]">
                    <span className="truncate">{x.label}</span>
                    <b className="tabular-nums">{x.count}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3 inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> Quem clicou
            </p>
            {(insights.data?.clickers ?? []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Os primeiros cliques aparecem aqui, prontos para o vendedor ligar.
              </p>
            ) : (
              <ul className="space-y-1">
                {insights.data!.clickers.map((m) => (
                  <li key={m.id}>
                    {m.contact_id ? (
                      <Link
                        to="/contatos/$contactId"
                        params={{ contactId: m.contact_id }}
                        className="row-wash flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-[13px]"
                      >
                        <span className="truncate">
                          {(m.contacts as unknown as { name: string | null } | null)?.name ??
                            m.to_email}
                        </span>
                        <span className="shrink-0 text-[11px] text-subtle">
                          {m.first_cta ?? ""} · {formatRelative(m.clicked_at)}
                        </span>
                      </Link>
                    ) : (
                      <span className="flex justify-between px-2 py-1.5 text-[13px]">
                        {m.to_email}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="inline-flex items-center gap-1.5 text-[11px] text-subtle">
            <Send className="size-3" /> Abertura é estimada: alguns provedores bloqueiam o pixel.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-[16px] font-semibold tabular-nums">{value}</p>
      <p className="text-subtle">{label}</p>
    </div>
  );
}
