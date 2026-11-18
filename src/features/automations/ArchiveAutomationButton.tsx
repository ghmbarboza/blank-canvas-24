import { useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";

import { useDeleteAutomation } from "./api";

type Props = {
  accountId: string;
  automationId: string;
  name: string;
  active: boolean;
  /** só ícone (lista) ou ícone + texto (editor) */
  compact?: boolean;
  onArchived?: () => void;
};

// Arquivar automação: some da lista e para de rodar. Sempre com confirmação.
export function ArchiveAutomationButton({
  accountId,
  automationId,
  name,
  active,
  compact,
  onArchived,
}: Props) {
  const archive = useDeleteAutomation(accountId);
  const [open, setOpen] = useState(false);

  function confirm() {
    archive.mutate(automationId, {
      onSuccess: () => {
        toast.success("Automação arquivada");
        setOpen(false);
        onArchived?.();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "sm"}
          aria-label={`Arquivar ${name}`}
          title="Arquivar"
        >
          <Archive aria-hidden />
          {!compact && "Arquivar"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {active ? "Ela está ligada: para de rodar agora e ninguém novo entra no fluxo. " : ""}A
            automação sai da lista. O histórico do que já rodou continua guardado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={archive.isPending}
          >
            {archive.isPending && <Loader2 className="animate-spin" />}
            Arquivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
