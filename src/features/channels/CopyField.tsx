import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  className?: string;
}

// Campo só leitura com botão copiar (URL de webhook, token, link de convite).
export function CopyField({ label, value, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não deu para copiar. Selecione o texto e copie à mão.");
    }
  }

  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <span className="text-[11px] font-semibold tracking-widest text-subtle uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-3">
        <code
          className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground select-all"
          title={value}
        >
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copy}
          aria-label={`Copiar ${label}`}
        >
          {copied ? <Check className="text-foreground" aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
