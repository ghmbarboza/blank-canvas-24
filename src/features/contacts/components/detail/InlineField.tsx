import { useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";

import { Input } from "@/components/ui/input";

type Props = {
  label: string;
  value: string | null;
  display?: string | undefined;
  type?: string;
  onSave: (value: string) => Promise<void>;
  validate?: ((value: string) => string | null) | undefined;
};

// Campo editável no lugar: clica, edita, Enter salva, Esc cancela.
export function InlineField({ label, value, display, type = "text", onSave, validate }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    if (next === (value ?? "")) {
      setEditing(false);
      return;
    }
    const problem = validate?.(next) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // O chamador já mostrou o toast; o campo fica aberto para corrigir.
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void commit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-2 py-1">
      <dt className="pt-1.5 text-[12px] text-subtle">{label}</dt>
      <dd className="min-w-0">
        {editing ? (
          <>
            <Input
              autoFocus
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => void commit()}
              disabled={saving}
              aria-label={label}
              aria-invalid={Boolean(error)}
              className="h-8 text-[13px]"
            />
            {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
          </>
        ) : (
          <button
            type="button"
            onClick={start}
            className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Editar ${label.toLowerCase()}`}
          >
            <span className={value ? "truncate" : "text-subtle"}>
              {value ? (display ?? value) : "Adicionar"}
            </span>
            <Pencil
              className="size-3 shrink-0 text-subtle opacity-0 group-hover:opacity-100"
              aria-hidden
            />
          </button>
        )}
      </dd>
    </div>
  );
}
