import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";

interface Suggestion {
  id: string;
  shortcut: string;
  title: string;
  text: string;
  missing: string[];
}

// Macros sugeridas pela IA conforme a intenção do cliente (inbox e chamado). O atendente revisa e envia.
export function MacroSuggest({
  accountId,
  conversationId,
  ticketId,
  onPick,
}: {
  accountId: string;
  conversationId?: string | null | undefined;
  ticketId?: string | null | undefined;
  onPick: (text: string) => void;
}) {
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: () =>
      callApi<{ intent: string | null; suggestions: Suggestion[] }>("/api/sac", {
        accountId,
        action: "macro.suggest",
        conversationId: conversationId ?? null,
        ticketId: ticketId ?? null,
      }),
    onSuccess: (r) => {
      setIntent(r.intent);
      setList(r.suggestions);
      if (r.suggestions.length === 0)
        toast.info("Nenhuma resposta pronta serve aqui. Cadastre macros em Ajustes › Atendimento.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function pick(s: Suggestion) {
    onPick(s.text);
    setList(null);
    if (s.missing.length) toast.warning(`Confira antes de enviar: faltou ${s.missing.join(", ")}`);
    void callApi("/api/sac", { accountId, action: "macro.used", id: s.id }).catch(() => undefined);
  }

  if (list && list.length > 0)
    return (
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="list"
        aria-label="Respostas prontas sugeridas"
      >
        {intent && <span className="text-[11px] text-subtle">Intenção: {intent} ·</span>}
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            role="listitem"
            onClick={() => pick(s)}
            title={s.text}
            className="max-w-[220px] truncate rounded-full border border-primary-line bg-primary-soft px-2.5 py-1 text-[12px] text-primary transition-transform duration-150 hover:bg-primary hover:text-primary-foreground active:scale-[0.98]"
          >
            {s.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setList(null)}
          className="rounded-full p-1 text-muted-foreground hover:bg-surface-2"
          aria-label="Fechar sugestões"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );

  return (
    <button
      type="button"
      onClick={() => ask.mutate()}
      disabled={ask.isPending}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
    >
      {ask.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
      Resposta pronta
    </button>
  );
}
