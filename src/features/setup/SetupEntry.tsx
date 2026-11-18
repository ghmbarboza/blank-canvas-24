// Indicador fixo do onboarding (regra de 28/10): enquanto faltar configuração obrigatória, o
// layout mostra quantas faltam e reabre a Nexa no passo pendente. Depois do mínimo, o mesmo
// botão vira a porta da conversa com o agente. Tudo lê o roteiro da Nexa (useRoteiro).
import { ArrowRight, Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

import { useRoteiro, type RoteiroView } from "./progress";
import { useSetup } from "./SetupWizard";

function Ring({ pct, size = 20 }: { pct: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="-rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeWidth={2.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

function summary(r: RoteiroView) {
  const required = r.steps.filter((s) => s.required);
  const done = required.filter((s) => s.done).length;
  return {
    pending: r.requiredPending,
    pct: required.length ? Math.round((done / required.length) * 100) : 100,
    next: r.steps.find((s) => s.id === r.current) ?? null,
  };
}

const faltam = (n: number) => (n === 1 ? "Falta 1 configuração" : `Faltam ${n} configurações`);

function useEntry() {
  const { current, isAdmin } = useAccount();
  const roteiro = useRoteiro(current?.accountId ?? null, isAdmin);
  const { openNexa } = useSetup();
  return { isAdmin, data: roteiro.data, openNexa };
}

/** Item do menu lateral (dono/admin): conta o que falta e abre a Nexa no passo pendente. */
export function SetupRailButton({ expanded }: { expanded: boolean }) {
  const { isAdmin, data, openNexa } = useEntry();
  if (!isAdmin || !data) return null;
  const { pending, pct } = summary(data);
  return (
    <button
      type="button"
      onClick={openNexa}
      aria-label={
        pending ? `${faltam(pending)}: configurar com a Nexa` : "Falar com a Nexa: ajustar o agente"
      }
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-xl border text-foreground transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pending
          ? "border-primary-line bg-primary-soft hover:bg-[var(--via-navy-08)]"
          : "border-border bg-surface hover:bg-surface-2",
        expanded ? "mx-0 h-11 px-3" : "size-11 justify-center",
      )}
    >
      {pending ? (
        <span className="text-foreground">
          <Ring pct={pct} />
        </span>
      ) : (
        <Bot className="size-[18px] text-[hsl(var(--nexa-accent))]" aria-hidden />
      )}
      {expanded ? (
        <span className="flex-1 text-left">
          <span className="block text-[13px] font-medium leading-tight">
            {pending ? "Configurar" : "Nexa"}
          </span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            {pending ? faltam(pending) : "Ajustar o agente"}
          </span>
        </span>
      ) : null}
    </button>
  );
}

/** No celular o menu fica escondido: o que falta aparece num selo fixo, sempre à vista. */
export function SetupPendingPill() {
  const { isAdmin, data, openNexa } = useEntry();
  if (!isAdmin || !data || !data.requiredPending) return null;
  return (
    <button
      type="button"
      onClick={openNexa}
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary-line bg-background px-4 py-2 text-[13px] font-medium shadow-[0_8px_30px_-10px_rgb(0_0_0/0.35)] md:hidden"
    >
      <span className="size-2 rounded-full bg-primary" aria-hidden />
      {faltam(data.requiredPending)}
      <ArrowRight className="size-3.5" aria-hidden />
    </button>
  );
}

/** Cartão do Painel: o próximo passo obrigatório, em linguagem direta. */
export function SetupProgressCard() {
  const { isAdmin, data, openNexa } = useEntry();
  if (!isAdmin || !data || !data.requiredPending) return null;
  const { pct, next } = summary(data);
  return (
    <section
      aria-label="Configuração da central"
      className="relative overflow-hidden rounded-[22px] border border-border bg-surface p-5 text-foreground md:p-6"
    >
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <span className="text-foreground">
            <Ring pct={pct} size={52} />
          </span>
          <div>
            <p className="text-[12px] text-muted-foreground">{faltam(data.requiredPending)}</p>
            <p className="text-[18px] font-semibold tracking-tight">
              {next ? `Próximo: ${next.title.toLowerCase()}` : "Falta pouco"}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              É o mínimo para a central funcionar. A Nexa faz com você, conversando.
            </p>
          </div>
        </div>
        <div className="md:ml-auto">
          <Button variant="outline" onClick={openNexa}>
            Continuar com a Nexa
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
