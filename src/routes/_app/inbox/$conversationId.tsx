import { createFileRoute } from "@tanstack/react-router";

import { useAccountId } from "@/lib/account";
import { ConversationView } from "@/features/inbox/components/ConversationView";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/inbox/$conversationId")({
  head: () => pageHead("Conversa", "Atendimento de uma conversa no Vínculo."),
  component: ConversationPage,
});

function ConversationPage() {
  const accountId = useAccountId();
  const { conversationId } = Route.useParams();
  // key: trocar de conversa zera rascunho, rolagem e sugestões.
  return (
    <ConversationView key={conversationId} accountId={accountId} conversationId={conversationId} />
  );
}
