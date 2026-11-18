interface Props {
  score: number;
  size?: number;
}

// Anel da nota 0–100 do contato. Traço navy sobre trilho cinza; o número vai no centro.
export function HealthRing({ score, size = 64 }: Props) {
  const s = Math.max(0, Math.min(100, score));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Nota ${s} de 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(s / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]"
        />
      </svg>
      <span className="absolute font-display text-[20px] font-semibold tabular-nums" aria-hidden>
        {s}
      </span>
    </span>
  );
}
