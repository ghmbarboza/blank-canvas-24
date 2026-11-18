import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";

import { useAccountId } from "@/lib/account";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/features/inbox/components/ConversationList";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxLayout,
});

// Lista à esquerda e conversa à direita. Abaixo de lg, a lista ocupa tudo e a conversa abre por cima.
function InboxLayout() {
  const accountId = useAccountId();
  const params = useParams({ strict: false });
  const hasSelection = Boolean(params.conversationId);

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside
        aria-label="Lista de conversas"
        className={cn(
          "min-h-0 w-full shrink-0 border-r border-border bg-background lg:block lg:w-[360px]",
          hasSelection ? "hidden" : "block",
        )}
      >
        <ConversationList accountId={accountId} />
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 lg:flex", hasSelection ? "flex" : "hidden")}>
        <Outlet />
      </section>
    </div>
  );
}
