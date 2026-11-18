import { createFileRoute } from "@tanstack/react-router";

import { AskNexusPage } from "@/features/agents/AskNexusPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/pergunte")({
  head: () =>
    pageHead(
      "Pergunte à Central de CS",
      "Perguntas sobre a operação respondidas com os seus relatórios.",
    ),
  component: AskNexusPage,
});
