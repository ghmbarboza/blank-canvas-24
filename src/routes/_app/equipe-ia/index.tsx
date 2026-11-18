import { createFileRoute } from "@tanstack/react-router";

import { AgentsPage } from "@/features/agents/AgentsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/equipe-ia/")({
  head: () =>
    pageHead(
      "Equipe de IA",
      "Agentes de IA que atendem, vendem e cobram, com avaliação antes de ligar.",
    ),
  component: AgentsPage,
});
