import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { formatNumber } from "@/lib/format";

import { formatDuration, type ChannelRow } from "./gerencial";
import { Card, EmptyNote } from "./ui";
import { countLabel } from "@/lib/plural";

export function ChannelsCard({
  channels,
  className,
}: {
  channels: ChannelRow[];
  className?: string;
}) {
  const total = channels.reduce((s, c) => s + c.total, 0);
  const max = Math.max(1, ...channels.map((c) => c.total));
  const top = channels[0];

  return (
    <Card
      id="painel-canais"
      eyebrow="Canais"
      title={
        top && total > 0
          ? `${PLATFORM_LABEL[top.platform] ?? top.platform} concentra ${Math.round((100 * top.total) / total)}% do volume`
          : "Volume por canal"
      }
      link={{ to: "/canais", label: "Gerenciar canais" }}
      className={className}
    >
      {total === 0 ? (
        <EmptyNote>Conecte um canal para ver o volume aqui.</EmptyNote>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {channels.map((c) => (
            <li
              key={c.platform}
              className="row-wash grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-2 py-2"
            >
              <ChannelIcon platform={c.platform} size={30} variant="badge" />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-medium">
                    {PLATFORM_LABEL[c.platform] ?? c.platform}
                  </p>
                  <p className="text-[12px] text-subtle tabular-nums">
                    {countLabel(c.conversations, "conversa")}
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${(c.total / max) * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-20 text-right">
                <p className="text-[13px] font-semibold tabular-nums">
                  {Math.round((100 * c.total) / total)}%
                </p>
                <p
                  className="text-[11px] text-subtle tabular-nums"
                  title="Tempo médio de 1ª resposta"
                >
                  {formatDuration(c.frt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
