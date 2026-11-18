import { useMemo, useState } from "react";

import { formatNumber } from "@/lib/format";

import type { Gerencial } from "./gerencial";
import { Card, EmptyNote } from "./ui";
import { countLabel } from "@/lib/plural";

const DOW = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DOW_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Mapa de calor dia × hora das mensagens recebidas: mostra quando escalar gente.
export function Heatmap({ cells, className }: { cells: Gerencial["heatmap"]; className?: string }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; n: number } | null>(null);
  const { grid, max, peak } = useMemo(() => {
    const g = new Map<string, number>();
    let m = 0;
    let p: { dow: number; hour: number; n: number } | null = null;
    for (const c of cells) {
      g.set(`${c.dow}-${c.hour}`, c.n);
      if (c.n > m) {
        m = c.n;
        p = c;
      }
    }
    return { grid: g, max: m, peak: p };
  }, [cells]);

  const focus = hover ?? peak;

  return (
    <Card
      id="painel-calor"
      eyebrow="Mapa de calor do atendimento"
      title={
        peak ? `Pico na ${DOW_LONG[peak.dow - 1]} às ${peak.hour} h` : "Quando os clientes escrevem"
      }
      className={className}
    >
      {max === 0 ? (
        <EmptyNote>O mapa aparece com as primeiras mensagens recebidas.</EmptyNote>
      ) : (
        <>
          <div className="flex-1 overflow-x-auto">
            <div
              role="grid"
              aria-label="Mensagens recebidas por dia da semana e hora"
              className="grid h-full min-w-[440px] grid-cols-[30px_repeat(24,minmax(0,1fr))] grid-rows-[auto_repeat(7,minmax(18px,1fr))] gap-[3px]"
              onMouseLeave={() => setHover(null)}
            >
              <span />
              {HOURS.map((h) => (
                <span key={h} className="text-center text-[11px] text-subtle tabular-nums">
                  {h % 3 === 0 ? h : ""}
                </span>
              ))}
              {DOW.map((label, i) => (
                <div key={label} role="row" className="contents">
                  <span
                    role="rowheader"
                    className="self-center text-[11px] text-subtle tabular-nums"
                  >
                    {label}
                  </span>
                  {HOURS.map((h) => {
                    const n = grid.get(`${i + 1}-${h}`) ?? 0;
                    const t = n / max;
                    const active = focus?.dow === i + 1 && focus.hour === h;
                    return (
                      <span
                        key={h}
                        role="gridcell"
                        title={`${label} ${h} h: ${countLabel(n, "mensagem", "mensagens")}`}
                        onMouseEnter={() => setHover({ dow: i + 1, hour: h, n })}
                        className={`rounded-[4px] transition-transform duration-150 hover:scale-110 ${active ? "ring-2 ring-primary ring-offset-1 ring-offset-surface" : ""}`}
                        style={{
                          background:
                            n === 0
                              ? "var(--surface-2)"
                              : `color-mix(in oklab, var(--chart-1) ${Math.round(14 + t * 86)}%, var(--surface-2))`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {focus && (
                <>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatNumber(focus.n)}
                  </span>{" "}
                  mensagens na {DOW_LONG[focus.dow - 1]} às {focus.hour} h
                </>
              )}
            </span>
            <span>Menos</span>
            <span
              className="h-1.5 w-20 rounded-full"
              style={{ background: "linear-gradient(90deg, var(--surface-2), var(--chart-1))" }}
              aria-hidden
            />
            <span>Mais</span>
          </div>
        </>
      )}
    </Card>
  );
}
