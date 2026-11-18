// Convite tracejado para criar o Supervisor quando a equipe ainda não tem um.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";

import { agentKeys, agentsApi } from "./api";

type Props = { accountId: string; onCreated: (agentId: string) => void };

export function SupervisorSetupCard({ accountId, onCreated }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const { agentId } = await agentsApi<{ agentId: string }>(accountId, "template.create", {
        template: "supervisor",
      });
      await qc.invalidateQueries({ queryKey: agentKeys.all(accountId) });
      toast.success("Supervisor criado. Ligue quando quiser que ele vigie a fila.");
      onCreated(agentId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="supervisor-setup"
      className="mt-6 flex flex-col gap-4 rounded-2xl border border-dashed border-border-strong bg-surface/60 p-5 sm:flex-row sm:items-center"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface">
        <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="supervisor-setup" className="text-[15px] font-medium">
          Agente Supervisor não configurado
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Ele lê a fila a cada 5 minutos e avisa você sobre conversa travada, cliente irritado,
          promessa indevida da IA e conversa sem dono.
        </p>
      </div>
      <Button variant="outline" onClick={() => void create()} disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Configurar supervisor
      </Button>
    </section>
  );
}
