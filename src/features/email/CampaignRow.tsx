import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { CampaignStats, EmailCampaign } from "./api";
import { engagement } from "./campaign-list";
import { CampaignStatusPill } from "./CampaignStatusPill";
import { pct } from "./pct";

type Props = { c: EmailCampaign & { stats: CampaignStats | null } };

function when(c: EmailCampaign): string {
  if (c.status === "scheduled" && c.scheduled_at) return `Sai em ${formatDateTime(c.scheduled_at)}`;
  if (c.finished_at) return `Terminou ${formatRelative(c.finished_at)}`;
  if (c.started_at) return `Disparada ${formatRelative(c.started_at)}`;
  return `Editada ${formatRelative(c.updated_at)}`;
}

// Uma linha da lista: no celular empilha, no desktop vira tabela de quatro colunas.
export function CampaignRow({ c }: Props) {
  const e = engagement(c.stats);
  const failed = Boolean(c.last_error) && c.status !== "sent";
  return (
    <li>
      <Link
        to={c.status === "draft" ? "/campanhas/$campaignId/editar" : "/campanhas/$campaignId"}
        params={{ campaignId: c.id }}
        className={cn(
          "row-wash grid gap-3 px-4 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset active:scale-[0.995] sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)] lg:items-center lg:gap-4",
          failed && "bg-danger/5",
        )}
      >
        <span className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full",
              c.status === "draft"
                ? "border border-border bg-surface-2 text-subtle"
                : "bg-primary-soft text-foreground",
            )}
          >
            <Mail className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold">{c.name}</span>
            <span className="block truncate text-[12px] text-subtle">
              {c.subject || "Sem assunto ainda"}
            </span>
            {failed ? (
              <span className="mt-0.5 block truncate text-[12px] text-danger">{c.last_error}</span>
            ) : (
              <span className="mt-0.5 block truncate text-[11px] text-subtle tabular-nums">
                {when(c)}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2 pl-[52px] lg:pl-0">
          <CampaignStatusPill status={c.status} />
        </span>
        <span className="hidden text-[13px] font-medium tabular-nums lg:block">
          {c.audience_estimate != null ? (
            formatNumber(c.audience_estimate)
          ) : (
            <span className="text-subtle">—</span>
          )}
        </span>
        {e.sent > 0 ? (
          <span className="flex items-center gap-3 pl-[52px] text-[11px] text-subtle lg:pl-0">
            <Figure value={formatNumber(e.sent)} label="enviados" />
            <Divider />
            <Figure value={pct(e.openRate ?? 0)} label="abriram" />
            <Divider />
            <Figure value={pct(e.clickRate ?? 0)} label="clicaram" />
          </span>
        ) : (
          <span className="hidden text-[13px] text-subtle lg:block">
            {c.status === "draft" ? "Ainda não enviada" : "Aguardando o primeiro envio"}
          </span>
        )}
      </Link>
    </li>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[13px] font-semibold text-foreground tabular-nums">{value}</span>
      {label}
    </span>
  );
}

function Divider() {
  return <span className="h-6 w-px bg-border" aria-hidden />;
}
