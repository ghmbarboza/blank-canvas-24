import { useState, type FormEvent } from "react";
import { Tag, X } from "lucide-react";

import { useUpdateConversation } from "../api";
import { normalizeTag } from "../lib/filters";
import type { Conversation } from "../types";

const MAX_TAGS = 10;

// Etiquetas da conversa (#64): marcar o assunto para filtrar depois ("boleto", "vip", "troca").
export function ConversationTags({
  accountId,
  conversation,
}: {
  accountId: string;
  conversation: Conversation;
}) {
  const update = useUpdateConversation(accountId, conversation.id);
  const tags = conversation.tags ?? [];
  const [draft, setDraft] = useState("");

  const save = (next: string[], success: string) =>
    update.mutate({ patch: { tags: next }, success });

  const add = (e: FormEvent) => {
    e.preventDefault();
    const tag = normalizeTag(draft);
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) {
      setDraft("");
      return;
    }
    save([...tags, tag], `Etiqueta “${tag}” adicionada`);
    setDraft("");
  };

  return (
    <div className="space-y-2.5">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas da conversa">
          {tags.map((t) => (
            <li
              key={t}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-2.5 text-[13px] text-foreground"
            >
              {t}
              <button
                type="button"
                aria-label={`Tirar a etiqueta ${t}`}
                disabled={update.isPending}
                onClick={() =>
                  save(
                    tags.filter((x) => x !== t),
                    `Etiqueta “${t}” removida`,
                  )
                }
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-[var(--via-navy-06,rgba(10,31,59,0.06))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {tags.length < MAX_TAGS ? (
        <form onSubmit={add} className="flex items-center gap-2">
          <label className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-ring">
            <Tag className="size-3.5 text-subtle" aria-hidden />
            <input
              value={draft}
              maxLength={30}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tags.length ? "Outra etiqueta" : "Ex.: boleto, vip, troca"}
              aria-label="Nova etiqueta"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </label>
        </form>
      ) : (
        <p className="text-[13px] text-muted-foreground">Limite de {MAX_TAGS} etiquetas.</p>
      )}
    </div>
  );
}
