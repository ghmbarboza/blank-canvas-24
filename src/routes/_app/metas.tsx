import { createFileRoute } from "@tanstack/react-router";

import { GoalsPage } from "@/features/commerce/GoalsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/metas")({
  head: () => pageHead("Metas da equipe", "Metas do mês e bonificação da equipe."),
  component: GoalsPage,
});
