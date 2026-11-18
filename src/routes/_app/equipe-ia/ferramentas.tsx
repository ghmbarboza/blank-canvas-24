import { createFileRoute } from "@tanstack/react-router";

import { ComposioPage } from "@/features/agents/ComposioPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/equipe-ia/ferramentas")({
  head: () =>
    pageHead(
      "Ferramentas conectadas",
      "Apps da empresa conectados pela Composio para a equipe de IA.",
    ),
  component: ComposioPage,
});
