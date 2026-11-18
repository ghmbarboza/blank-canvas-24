import { Bot, Crown } from "lucide-react";

import { formatMoney, formatNumber, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { formatDuration, ROLE_LABEL, type TeamMember } from "./gerencial";
import { Card, EmptyNote } from "./ui";

// Ranking da equipe no período: quem respondeu, em quanto tempo e quanto fechou.
export function TeamCard({ team, className }: { team: TeamMember[]; className?: string }) {
  const max = Math.max(1, ...team.map((m) => m.replies));
  const topWon = team.reduce<TeamMember | null>(
    (best, m) => (m.won_value > (best?.won_value ?? 0) ? m : best),
    null,
  );

  return (
    <Card
      id="painel-equipe"
      eyebrow="Equipe"
      title={
        topWon && topWon.won_value > 0
          ? `${topWon.name.split(" ")[0]} lidera em receita, com ${formatMoney(topWon.won_value, true)}`
          : "Desempenho por pessoa"
      }
      link={{ to: "/ajustes", label: "Gerenciar equipe" }}
      className={className}
    >
      {team.length === 0 ? (
        <EmptyNote>Convide a equipe em Ajustes.</EmptyNote>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-subtle">
                <th className="px-2 pb-2 font-medium">Pessoa</th>
                <th className="px-2 pb-2 font-medium">Respostas</th>
                <th className="px-2 pb-2 text-right font-medium">1ª resposta</th>
                <th className="px-2 pb-2 text-right font-medium">Abertas</th>
                <th className="px-2 pb-2 text-right font-medium">Ganho</th>
              </tr>
            </thead>
            <tbody>
              {team.slice(0, 6).map((m) => {
                const isAi = m.name.toLowerCase().startsWith("ia ");
                const isTop = topWon?.user_id === m.user_id && m.won_value > 0;
                return (
                  <tr key={m.user_id} className="row-wash">
                    <td className="rounded-l-xl px-2 py-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "relative grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                            isAi
                              ? "bg-primary text-primary-foreground"
                              : "bg-primary-soft text-foreground",
                          )}
                        >
                          {m.avatar_url ? (
                            <img
                              src={m.avatar_url}
                              alt=""
                              className="size-full rounded-full object-cover"
                            />
                          ) : isAi ? (
                            <Bot className="size-4" aria-hidden />
                          ) : (
                            initials(m.name)
                          )}
                          {isTop && (
                            <Crown
                              className="absolute -top-1.5 -right-1 size-3.5 fill-current text-foreground"
                              aria-label="Maior receita"
                            />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.name}</span>
                          <span className="block text-[11px] text-subtle">
                            {ROLE_LABEL[m.role] ?? m.role}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-10 text-right font-semibold tabular-nums">
                          {formatNumber(m.replies)}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <span
                            className="block h-full rounded-full bg-chart-2"
                            style={{ width: `${(m.replies / max) * 100}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatDuration(m.frt)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatNumber(m.open_conversations)}
                    </td>
                    <td className="rounded-r-xl px-2 py-2 text-right font-semibold tabular-nums">
                      {m.won_value > 0 ? (
                        formatMoney(m.won_value, true)
                      ) : (
                        <span className="font-normal text-subtle">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
