import { useState } from "react";
import { FlaskConical, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useAutomationAction } from "./api";
import { EXIT_LABEL, type ExitReason, type NodeType } from "./engine";
import { NODE_ICON } from "./nodeMeta";

interface SimResult {
  errors: string[];
  exit: ExitReason | null;
  steps: { node: string; type: NodeType; label: string; message: string; at: string }[];
}

// Simulação: percorre o fluxo com os dados reais de um contato, sem enviar nada nem gravar.
export function SimulateDialog({
  accountId,
  automationId,
  dirty,
  open,
  onOpenChange,
  onSaveFirst,
}: {
  accountId: string;
  automationId: string;
  dirty: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaveFirst: () => Promise<boolean>;
}) {
  const action = useAutomationAction(accountId);
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);

  async function run() {
    if (!contact) return;
    if (dirty && !(await onSaveFirst())) return;
    action.mutate(
      { action: "simulate", automationId, contactId: contact.id },
      { onSuccess: (r) => setResult(r as SimResult), onError: (e) => toast.error(errorMessage(e)) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Simular num contato</DialogTitle>
          <DialogDescription>
            Mostra por onde ele passaria, com as regras de consentimento, teto e horário. Nada é
            enviado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="flex-1">
            <ContactPicker accountId={accountId} value={contact} onChange={setContact} />
          </div>
          <Button onClick={() => void run()} disabled={!contact || action.isPending}>
            {action.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Simular
          </Button>
        </div>
        {result && (
          <div className="mt-2 space-y-3">
            {result.errors.length > 0 && (
              <p className="rounded-xl bg-danger/5 px-3 py-2 text-[12px] text-danger">
                {result.errors.join(" · ")}
              </p>
            )}
            {result.exit && (
              <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12px]">
                <LogOut className="size-3.5" /> Este contato sairia na hora:{" "}
                {EXIT_LABEL[result.exit]}.
              </p>
            )}
            <ol className="space-y-1.5">
              {result.steps.map((s, i) => {
                const Icon = NODE_ICON[s.type];
                return (
                  <li
                    key={`${s.node}-${i}`}
                    className="flex items-start gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-[#0A1F3B] text-white">
                      <Icon className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground">{s.message}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-subtle tabular-nums">
                      {formatDateTime(s.at)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
