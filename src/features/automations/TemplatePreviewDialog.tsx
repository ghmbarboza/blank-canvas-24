import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { FlowSentence } from "./FlowSentence";
import { blankGraph, type AutomationTemplate } from "./templates";

type Props = {
  /** undefined = fechado; null = começar do zero; modelo = prévia do modelo */
  template: AutomationTemplate | null | undefined;
  busy: boolean;
  onClose: () => void;
  onUse: (t: AutomationTemplate | null) => void;
};

// Prévia do modelo: nada é gravado até "Usar este modelo".
export function TemplatePreviewDialog({ template, busy, onClose, onUse }: Props) {
  const open = template !== undefined;
  const blank = template === null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{blank ? "Começar do zero" : template?.name}</DialogTitle>
          <DialogDescription>
            {blank
              ? "Cria um rascunho em branco para você montar o fluxo passo a passo no editor."
              : template?.description}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <FlowSentence
              trigger={template?.trigger ?? { type: "manual" }}
              graph={template?.graph ?? blankGraph()}
            />
          </div>
        )}
        <p className="text-[12px] text-muted-foreground">
          Nasce como rascunho: nada é enviado até você ligar.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => onUse(template ?? null)} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {blank ? "Criar rascunho" : "Usar este modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
