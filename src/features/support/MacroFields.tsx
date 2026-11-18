import { useState } from "react";
import { Bot } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { COMMON_INTENTS, MACRO_VARIABLES } from "./macros";

/** Intenções em que a macro serve (a IA usa para sugerir a resposta certa na hora certa). */
export function MacroIntentsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().toLowerCase().slice(0, 40);
    if (v && !value.includes(v) && value.length < 8) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="qr-intents" className="flex items-center gap-1.5">
        <Bot className="size-3.5 text-primary" aria-hidden /> Quando sugerir
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value.filter((x) => x !== v))}
            className="rounded-full bg-primary px-2.5 py-[3px] text-[11px] font-medium text-primary-foreground"
            aria-label={`Tirar ${v}`}
          >
            {v} ×
          </button>
        ))}
        {COMMON_INTENTS.filter((c) => !value.includes(c))
          .slice(0, 6)
          .map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => add(c)}
              className="rounded-full border border-dashed border-border px-2.5 py-[3px] text-[11px] text-muted-foreground hover:bg-surface-2"
            >
              + {c}
            </button>
          ))}
      </div>
      <Input
        id="qr-intents"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder="Outra intenção (Enter para incluir)"
        className="h-9"
      />
    </div>
  );
}

/** Variáveis disponíveis no texto; clicar insere no fim. */
export function MacroVariablesHint({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MACRO_VARIABLES.map((v) => (
        <button
          key={v.token}
          type="button"
          title={v.label}
          onClick={() => onInsert(v.token)}
          className={cn(
            "rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-surface-3",
          )}
        >
          {v.token}
        </button>
      ))}
    </div>
  );
}
