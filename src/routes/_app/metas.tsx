import { createFileRoute } from "@tanstack/react-router";

import { GoalsPage } from "@/features/commerce/GoalsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/metas")({
  head: () => pageHead("Metas", "Metas do mês, ranking do time e comissões."),
  component: GoalsPage,
});
