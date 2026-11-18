import { Loader2, Bot, X } from "lucide-react";

import type { ReplySuggestion } from "../api";

interface Props {
  loading: boolean;
  suggestions: ReplySuggestion[];
  onPick: (text: string) => void;
  onClose: () => void;
}

// Sugestões da IA dentro do composer: clicar preenche o texto, nunca envia sozinho.
export function ComposerSuggestions({ loading, suggestions, onPick, onClose }: Props) {
  if (!loading && suggestions.length === 0) return null;
  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-2.5" aria-live="polite">
      <Bot className="mt-1.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 py-1 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> A IA está lendo a conversa…
          </span>
        ) : (
          suggestions.map((s, i) => (
            <button
              key={`${s.label}-${i}`}
              type="button"
              onClick={() => onPick(s.text)}
              title={s.text}
              className="max-w-full truncate rounded-md border border-primary-line bg-primary-soft px-2.5 py-1 text-left text-[12px] font-medium text-primary transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              {s.label}
              <span className="ml-1.5 font-normal text-muted-foreground">{s.text}</span>
            </button>
          ))
        )}
      </div>
      {!loading && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar sugestões"
          className="grid size-6 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
