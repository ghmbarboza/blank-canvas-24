// Saúde do cliente na ficha, na lista e na Caixa de entrada. Mesma conta da tela Saúde da carteira
// (features/gestao/health.ts): começa em 100 e cada sinal ruim tira pontos, com o motivo escrito.
import { useMemo } from "react";
import { HeartPulse } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerHealth } from "@/features/gestao/api";
import {
  LEVEL_LABEL,
  scoreHealth,
  type HealthLevel,
  type HealthResult,
  type HealthSignals,
} from "@/features/gestao/health";
import { cn } from "@/lib/utils";

export interface CustomerHealth {
  signals: HealthSignals;
  result: HealthResult;
}

/** Saúde de cada cliente da conta, por id do contato. Quem ainda não é cliente fica de fora. */
export function useHealthMap(accountId: string) {
  const q = useCustomerHealth(accountId);
  const map = useMemo(() => {
    const out = new Map<string, CustomerHealth>();
    for (const s of q.data ?? []) out.set(s.contact_id, { signals: s, result: scoreHealth(s) });
    return out;
  }, [q.data]);
  return { map, isPending: q.isPending, isError: q.isError };
}

const LEVEL_STYLE: Record<HealthLevel, string> = {
  healthy: "border-border bg-surface-2 text-foreground",
  attention: "border-transparent bg-[#C4CFDD] text-[#0A1F3B] dark:bg-[#5E7B9E] dark:text-white",
  risk: "border-danger/30 bg-danger/10 text-danger",
};

// A cor nunca vem sozinha: sempre com o rótulo.
export function HealthChip({
  level,
  score,
  className,
}: {
  level: HealthLevel;
  score?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] leading-none font-medium whitespace-nowrap",
        LEVEL_STYLE[level],
        className,
      )}
    >
      {typeof score === "number" && <span className="font-semibold tabular-nums">{score}</span>}
      {LEVEL_LABEL[level]}
    </span>
  );
}

const RING_COLOR: Record<HealthLevel, string> = {
  healthy: "var(--primary)",
  attention: "#5E7B9E",
  risk: "var(--danger)",
};

function Ring({ score, level, size = 60 }: { score: number; level: HealthLevel; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Saúde ${score} de 100`}
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
          stroke={RING_COLOR[level]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute font-display text-[19px] font-semibold tabular-nums" aria-hidden>
        {score}
      </span>
    </span>
  );
}

/**
 * Saúde do cliente com o motivo e o que fazer. Para quem ainda não é cliente, diz isso com o
 * próximo passo em vez de mostrar uma nota que não existe.
 */
export function CustomerHealthBlock({
  accountId,
  contactId,
  maxFactors = 3,
}: {
  accountId: string;
  contactId: string;
  maxFactors?: number;
}) {
  const { map, isPending, isError } = useHealthMap(accountId);
  if (isPending) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (isError)
    return <p className="text-[13px] text-danger">Não deu para carregar a saúde do cliente.</p>;

  const health = map.get(contactId);
  if (!health) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong p-4 text-center">
        <HeartPulse className="mx-auto size-5 text-primary" aria-hidden />
        <p className="mt-2 text-[13px] text-muted-foreground">
          Ainda não é cliente. Quando a fase do contato passar para Cliente, a saúde aparece aqui
          com o motivo.
        </p>
      </div>
    );
  }

  const { result } = health;
  const bad = result.factors.filter((f) => f.points < 0).slice(0, maxFactors);
  return (
    <div>
      <div className="flex items-center gap-4">
        <Ring score={result.score} level={result.level} />
        <div className="min-w-0 flex-1">
          <HealthChip level={result.level} />
          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
            {bad.length === 0
              ? "Nenhum sinal de risco: conversa em dia, sem chamado aberto e sem nota baixa."
              : `Risco de sair: ${result.churnRisk}.`}
          </p>
        </div>
      </div>
      {bad.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Motivos">
          {bad.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-[12px] leading-snug">
              <span className="mt-px shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-foreground tabular-nums">
                {f.points}
              </span>
              <span className="text-muted-foreground">{f.label}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 rounded-lg bg-surface-2 p-3 text-[12px] leading-snug text-foreground">
        <span className="font-semibold">O que fazer:</span> {result.nextAction}.
      </p>
    </div>
  );
}
