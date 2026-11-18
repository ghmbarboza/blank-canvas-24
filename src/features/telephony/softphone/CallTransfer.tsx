import { useState } from "react";
import { ArrowRightLeft, Copy } from "lucide-react";
import { toast } from "sonner";

import { useLive } from "@/features/queue/api";
import { AGENT_STATE_LABEL } from "@/features/queue/lib";
import { useAuth } from "@/lib/auth";

import { transferCodes } from "./transfer-codes";

// Transferir a ligação em curso (#69): escolhe o colega e o Vínculo mostra os dois códigos da PBX.
export function CallTransfer({ accountId }: { accountId: string }) {
  const { user } = useAuth();
  const live = useLive(accountId);
  const [target, setTarget] = useState("");
  const colleagues = (live.data?.agents ?? []).filter((a) => a.user_id !== user?.id && a.extension);
  const chosen = colleagues.find((c) => c.user_id === target);
  const codes = chosen?.extension ? transferCodes(chosen.extension) : null;

  const copy = (code: string) =>
    void navigator.clipboard?.writeText(code).then(() => toast.success(`${code} copiado`));

  return (
    <div className="space-y-2">
      <p className="eyebrow flex items-center gap-1.5">
        <ArrowRightLeft className="size-3.5" aria-hidden /> Transferir
      </p>
      {colleagues.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nenhum colega com ramal. O gestor cria ramais em Ajustes › Telefonia.
        </p>
      ) : (
        <select
          aria-label="Colega para transferir"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="">Escolha um colega</option>
          {colleagues.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.name} · {AGENT_STATE_LABEL[c.state]} · ramal {c.extension}
            </option>
          ))}
        </select>
      )}
      {codes && (
        <div className="grid gap-2">
          {[
            {
              code: codes.attended,
              title: "Falar antes com o colega",
              note: "Você apresenta o caso e desliga; o cliente passa para ele.",
            },
            {
              code: codes.blind,
              title: "Passar direto",
              note: "O cliente vai para o colega na hora, sem você falar com ele.",
            },
          ].map((o) => (
            <div key={o.code} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{o.title}</p>
                <p className="text-[13px] text-muted-foreground">{o.note}</p>
              </div>
              <span className="font-display text-[20px] font-semibold tabular-nums">{o.code}</span>
              <button
                type="button"
                onClick={() => copy(o.code)}
                aria-label={`Copiar ${o.code}`}
                className="grid size-8 place-items-center rounded-md text-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Copy className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <p className="text-[13px] text-muted-foreground">
            Digite o código no teclado da ligação (no telefone ou no teclado do telefone do
            navegador).
          </p>
        </div>
      )}
    </div>
  );
}
