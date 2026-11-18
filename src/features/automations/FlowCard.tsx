import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Automation, AutomationStats, TodayStats } from "./api";
import { ArchiveAutomationButton } from "./ArchiveAutomationButton";
import { FlowSentence } from "./FlowSentence";

const KIND_LABEL: Record<string, string> = {
  journey: "Jornada",
  sequence: "Cadência de vendas",
  rule: "Regra",
};

type Props = {
  a: Automation & { stats: AutomationStats };
  today: TodayStats | undefined;
  canToggle: boolean;
  toggling: boolean;
  onToggle: (on: boolean) => void;
  accountId: string;
};

// Uma automação: a frase do fluxo, o que rodou hoje e o liga/desliga.
export function FlowCard({ a, today, canToggle, toggling, onToggle, accountId }: Props) {
  const isDraft = a.status === "draft";
  const isOn = a.status === "active";
  const done = (today?.ok ?? 0) + (today?.failed ?? 0);
  const success = done ? Math.round(((today?.ok ?? 0) / done) * 100) : null;
  const failedToday = today?.failed ?? 0;
  const meta = [
    KIND_LABEL[a.kind] ?? a.kind,
    a.stats.active ? `${formatNumber(a.stats.active)} andando agora` : null,
    a.stats.total ? `${Math.round((a.stats.converted / a.stats.total) * 100)}% converteram` : null,
    `editada ${formatRelative(a.updated_at)}`,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "lift rounded-[24px] border bg-surface p-4 sm:p-5",
        success !== null && success < 90 ? "border-danger/40" : "border-border",
        !isOn && !isDraft && "bg-surface-2/60",
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <Link
          to="/automacoes/$automationId"
          params={{ automationId: a.id }}
          className="group min-w-0 flex-1 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="mb-2 flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold group-hover:underline">
              {a.name}
            </span>
            {isDraft && (
              <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Rascunho
              </span>
            )}
            {failedToday > 0 && (
              <span className="shrink-0 rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                {failedToday} {failedToday === 1 ? "falha" : "falhas"} hoje
              </span>
            )}
          </span>
          <FlowSentence trigger={a.trigger} graph={a.graph} muted={!isOn && !isDraft} />
          <span className="mt-2 block truncate text-[11px] text-subtle">{meta.join(" · ")}</span>
        </Link>

        <div className="flex items-center gap-5 border-t border-border pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-5">
          <Figure value={formatNumber(today?.runs ?? 0)} label="rodaram hoje" dim={!today?.runs} />
          <Figure
            value={success === null ? "—" : `${success}%`}
            label="sucesso"
            dim={success === null}
            alert={success !== null && success < 90}
          />
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            {isDraft ? (
              <Link
                to="/automacoes/$automationId"
                params={{ automationId: a.id }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Continuar <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            ) : (
              <Switch
                checked={isOn}
                disabled={!canToggle || toggling}
                onCheckedChange={onToggle}
                aria-label={isOn ? `Desligar ${a.name}` : `Ligar ${a.name}`}
              />
            )}
            {canToggle && (
              <ArchiveAutomationButton
                accountId={accountId}
                automationId={a.id}
                name={a.name}
                active={isOn}
                compact
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Figure({
  value,
  label,
  dim,
  alert,
}: {
  value: string;
  label: string;
  dim: boolean;
  alert?: boolean;
}) {
  return (
    <div className="min-w-16 text-left md:text-right">
      <p
        className={cn(
          "font-display text-[18px] leading-tight font-semibold tabular-nums",
          dim && "text-subtle",
          alert && "text-danger",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-subtle">{label}</p>
    </div>
  );
}
