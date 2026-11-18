import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  className?: string;
};

const MAX_TAG = 40;

export function TagEditor({ tags, onChange, disabled = false, className }: Props) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim().slice(0, MAX_TAG);
    setDraft("");
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 py-0.5 pr-1 pl-2 text-[12px]"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            disabled={disabled}
            className="rounded p-0.5 text-subtle hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Remover tag ${t}`}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        disabled={disabled}
        placeholder={tags.length ? "Adicionar" : "Adicionar tag e Enter"}
        aria-label="Nova tag"
        className="h-7 w-32 min-w-0 flex-1 border-dashed text-[12px]"
      />
    </div>
  );
}
