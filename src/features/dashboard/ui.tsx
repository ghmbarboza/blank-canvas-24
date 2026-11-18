import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type LinkTo = "/agenda" | "/contatos" | "/inbox" | "/canais" | "/crm" | "/ajustes" | "/origem";

interface CardProps {
  id: string;
  eyebrow: string;
  title?: string;
  aside?: ReactNode;
  link?: { to: LinkTo; label: string };
  className?: string | undefined;
  children: ReactNode;
}

// Cartão do painel: rótulo editorial, título opcional, sobe 3px no hover (assinatura do DS).
export function Card({ id, eyebrow, title, aside, link, className, children }: CardProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "lift relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5",
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id={id} className="eyebrow">
            {eyebrow}
          </p>
          {title && (
            <h2 className="mt-1.5 font-display text-[17px] leading-tight font-medium text-foreground">
              {title}
            </h2>
          )}
        </div>
        {aside}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {link && (
        <Link
          to={link.to}
          className="group mt-4 -mb-1 inline-flex items-center gap-1 self-start rounded-full text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {link.label}
          <ChevronRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      )}
    </section>
  );
}

// Delta contra o período anterior. `invert` para métricas em que cair é bom (tempo de resposta).
export function Delta({
  value,
  invert = false,
  suffix = "%",
  onDark = false,
}: {
  value: number | null;
  invert?: boolean;
  suffix?: string;
  onDark?: boolean;
}) {
  if (value === null) {
    return (
      <span className={cn("text-[11px]", onDark ? "text-white/45" : "text-subtle")}>
        sem base anterior
      </span>
    );
  }
  const good = invert ? value < 0 : value > 0;
  const flat = value === 0;
  const Icon = value < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums",
        flat
          ? onDark
            ? "text-white/60"
            : "text-muted-foreground"
          : good
            ? onDark
              ? "text-[#6FD3A4]"
              : "text-foreground"
            : onDark
              ? "text-[#F0B4B4]"
              : "text-danger",
      )}
    >
      {!flat && <Icon className="size-3.5" aria-hidden />}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

// Curva suave (Catmull-Rom convertida em Bézier cúbica) para a tendência não parecer serrilhada.
function smoothPath(points: [number, number][]): string {
  const f = (n: number) => n.toFixed(1);
  const [first] = points;
  if (!first) return "";
  let d = `M${f(first[0])},${f(first[1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

// Linha de tendência compacta (SVG puro, sem eixo).
export function Sparkline({
  values,
  className,
  stroke = "currentColor",
  fill = true,
}: {
  values: (number | null)[];
  className?: string | undefined;
  stroke?: string;
  fill?: boolean;
}) {
  const gid = useId();
  const pts = values.map((v) => v ?? 0);
  if (pts.length < 2 || pts.every((v) => v === 0)) return null;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const W = 120;
  const H = 36;
  const coords = pts.map((v, i) => [
    (i / (pts.length - 1)) * W,
    H - 3 - ((v - min) / span) * (H - 8),
  ]);
  const line = smoothPath(coords as [number, number][]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} />}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Anel de nota 0–100 (nota da IA no lead).
export function ScoreRing({ score, size = 36 }: { score: number | null; size?: number }) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(s / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums" aria-label={`Nota ${s}`}>
        {score ?? "—"}
      </span>
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
