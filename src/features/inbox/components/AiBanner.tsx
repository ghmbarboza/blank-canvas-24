import { Loader2, Bot } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useUpdateConversation } from "../api";
import type { Conversation, Member } from "../types";

interface Props {
  accountId: string;
  conversation: Conversation;
  members: Member[];
}

// Faixa navy no topo da conversa enquanto a IA responde. "Assumir" faz a mesma passagem que a IA faz
// para a equipe (ai_handoff_at), e põe a conversa no seu nome: o orquestrador para de responder.
export function AiBanner({ accountId, conversation, members }: Props) {
  const { user } = useAuth();
  const update = useUpdateConversation(accountId, conversation.id);
  const me = members.find((m) => m.userId === user?.id)?.name ?? "equipe";

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 bg-[#001F35] px-3 py-2.5 text-white sm:px-5 dark:bg-surface-3"
    >
      <Bot className="size-4 shrink-0 text-white/80" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium">
        IA atendendo esta conversa
        <span className="hidden font-normal text-white/65 2xl:inline">
          {" "}
          · responde sozinha até alguém assumir
        </span>
      </p>
      <button
        type="button"
        disabled={update.isPending || !user}
        onClick={() =>
          update.mutate({
            patch: {
              ai_handoff_at: new Date().toISOString(),
              ai_handoff_reason: `Assumida por ${me}`,
              assignee_user_id: user?.id ?? null,
            },
            success: "Conversa assumida. A IA parou de responder.",
          })
        }
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-[#001F35] transition-transform focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#001F35] focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
      >
        {update.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        Assumir conversa
      </button>
    </div>
  );
}
