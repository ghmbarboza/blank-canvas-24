import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  status: string;
  error: string | null;
}

const LABEL: Record<string, string> = {
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
};

export function MessageStatus({ status, error }: Props) {
  if (status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded text-danger focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Falhou: ${error ?? "erro desconhecido"}`}
          >
            <AlertCircle className="size-3.5" aria-hidden />
            <span className="text-[11px] font-medium">Não enviada</span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{error ?? "O canal recusou o envio."}</TooltipContent>
      </Tooltip>
    );
  }
  const label = LABEL[status];
  if (!label) return null;
  const Icon = status === "queued" ? Clock : status === "sent" ? Check : CheckCheck;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex", status === "read" ? "text-primary" : "text-subtle")}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
