// Liga e desliga o piloto automático da equipe de IA (motor Agents SDK) e diz, em uma linha
// cada, o que muda: passagem de caso dentro da conversa, trava de regra e aprovação do gestor.
import { ArrowRightLeft, Hand, Loader2, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useEngine, useSetEngine } from "./api";

const POINTS = [
  {
    icon: ArrowRightLeft,
    text: "Um agente passa o caso para o outro na mesma resposta, sem o cliente repetir.",
  },
  {
    icon: ShieldCheck,
    text: "Resposta com preço ou promessa fora da regra é barrada e vai para a equipe.",
  },
  { icon: Hand, text: "Cobrar, disparar sequência ou agir em outro sistema espera o seu sim." },
];

export function AutopilotCard({ accountId }: { accountId: string }) {
  const { isAdmin } = useAccount();
  const engine = useEngine();
  const set = useSetEngine(accountId);
  const on = engine === "agents_sdk";

  return (
    <section
      aria-label="Piloto automático"
      className={cn(
        "mb-5 overflow-hidden rounded-[22px] border p-4 md:p-5",
        on
          ? "border-[hsl(var(--nexa-accent)/0.35)] bg-[hsl(var(--nexa-wash))]"
          : "border-border bg-surface",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full",
            on ? "bg-[hsl(var(--nexa-accent))] text-white" : "bg-surface-2 text-foreground/70",
          )}
        >
          <Zap className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-medium">Piloto automático</h2>
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-medium text-foreground">
              beta
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {on
              ? "Ligado: a equipe de IA atende sozinha e só para quando precisa do seu sim."
              : "A equipe atende sozinha, passa o caso entre si e para nas ações que pedem o seu sim."}
          </p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-3">
            {POINTS.map((p) => (
              <li key={p.text} className="flex gap-2 text-[12.5px] leading-snug text-foreground/80">
                <p.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px]">
          {set.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          <span className="sr-only">Piloto automático</span>
          <Switch
            checked={on}
            disabled={!isAdmin || set.isPending}
            aria-label={on ? "Desligar o piloto automático" : "Ligar o piloto automático"}
            onCheckedChange={(v) =>
              set.mutate(v ? "agents_sdk" : "classic", {
                onSuccess: () =>
                  toast.success(v ? "Piloto automático ligado" : "Piloto automático desligado"),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          />
        </label>
      </div>
    </section>
  );
}
