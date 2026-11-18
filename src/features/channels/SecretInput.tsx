import { useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  // A chave já está no cofre: mostra "configurada" e só abre o campo para substituir.
  configured: boolean;
  placeholder?: string;
  required?: boolean;
}

// Nunca mostramos a chave salva; só se ela existe.
export function SecretInput({
  id,
  label,
  value,
  onChange,
  configured,
  placeholder,
  required = false,
}: Props) {
  const [replacing, setReplacing] = useState(false);
  const showField = !configured || replacing;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {showField ? (
        <Input
          id={id}
          type="password"
          translate="no"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required && !configured}
        />
      ) : (
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 pr-1 pl-3">
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <KeyRound className="size-3.5 text-foreground" aria-hidden />
            Configurada <span className="tracking-widest text-subtle">••••</span>
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing(true)}>
            Substituir
          </Button>
        </div>
      )}
    </div>
  );
}
