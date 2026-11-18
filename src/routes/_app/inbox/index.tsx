import { createFileRoute } from "@tanstack/react-router";

import { useAccountId } from "@/lib/account";
import { InboxEmpty } from "@/features/inbox/components/InboxEmpty";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/inbox/")({
  head: () => pageHead("Caixa de entrada", "Conversas de todos os seus canais na Central de CS."),
  component: InboxIndex,
});

function InboxIndex() {
  const accountId = useAccountId();
  return <InboxEmpty accountId={accountId} />;
}
