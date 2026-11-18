import { cn } from "@/lib/utils";

type Props = {
  /** Pessoas necessárias por hora (Erlang C + pausa), índice = hora. */
  need: number[];
  /** Pessoas na escala gravada por hora; null quando o dia ainda não tem escala. */
  covered: number[] | null;
  firstHour: number;
  lastHour: number;
  selectedHour: number | null;
  onSelect: (hour: number) => void;
};

const GRID_LINES = 4;

// Linha do tempo por hora: barra escura = gente necessária; faixa clara atrás = gente escalada.
// Hora com menos gente escalada do que o necessário fica em coral (vai gerar espera).
export function HourlyDemand({
  need,
  covered,
  firstHour,
  lastHour,
  selectedHour,
  onSelect,
}: Props) {
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const max = Math.max(1, ...hours.map((h) => Math.max(need[h] ?? 0, covered?.[h] ?? 0)));
  const step = Math.max(1, Math.ceil(max / GRID_LINES));
  const top = step * GRID_LINES;
  const ticks = Array.from({ length: GRID_LINES + 1 }, (_, i) => top - i * step);

  return (
    <div>
      <div className="flex gap-2">
        <div
          className="relative h-56 w-6 shrink-0 text-right text-[11px] text-subtle tabular-nums"
          aria-hidden
        >
          <div className="absolute inset-x-0 top-0 bottom-6">
            {ticks.map((t, i) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2 leading-none"
                style={{ top: `${(i / GRID_LINES) * 100}%` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className="border-t border-dashed border-border" />
            ))}
          </div>
          <ol className="relative flex h-56 items-end gap-1 sm:gap-2" aria-label="Pessoas por hora">
            {hours.map((h) => {
              const n = need[h] ?? 0;
              const c = covered?.[h];
              const short = covered !== null && c !== undefined && c < n;
              const isSel = selectedHour === h;
              const label = `${h}h: precisa de ${n} ${n === 1 ? "pessoa" : "pessoas"}${
                c !== undefined && covered !== null ? `, ${c} na escala` : ""
              }${short ? `, faltam ${n - (c ?? 0)}` : ""}`;
              return (
                <li key={h} className="flex h-full min-w-0 flex-1 flex-col">
                  <button
                    type="button"
                    onClick={() => onSelect(h)}
                    aria-label={label}
                    aria-pressed={isSel}
                    title={label}
                    className={cn(
                      "group relative flex flex-1 items-end justify-center rounded-t-md pb-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isSel && "bg-[var(--wash-strong)]",
                    )}
                  >
                    {covered !== null && (
                      <span
                        className={cn(
                          "absolute bottom-0 left-1/2 w-full max-w-10 -translate-x-1/2 rounded-t-md bg-surface-3",
                          short && "ring-1 ring-danger/40",
                        )}
                        style={{ height: `${((c ?? 0) / top) * 100}%` }}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        "relative w-1/2 max-w-5 rounded-t-sm transition-opacity group-hover:opacity-80",
                        short ? "bg-danger" : "bg-primary",
                        n === 0 && "opacity-0",
                      )}
                      style={{ height: `${(n / top) * 100}%` }}
                      aria-hidden
                    />
                  </button>
                  <span
                    className={cn(
                      "h-6 pt-1.5 text-center text-[10px] text-subtle tabular-nums sm:text-[11px]",
                      isSel && "font-semibold text-foreground",
                      h % 2 === 1 && !isSel && "max-sm:invisible",
                    )}
                    aria-hidden
                  >
                    {String(h).padStart(2, "0")}h
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
