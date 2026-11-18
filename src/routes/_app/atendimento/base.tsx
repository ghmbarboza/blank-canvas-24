import { createFileRoute } from "@tanstack/react-router";

import { KnowledgeBasePage } from "@/features/support/KnowledgeBasePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/atendimento/base")({
  head: () => pageHead("Base de conhecimento", "Artigos da central de ajuda e do agente de IA."),
  component: KnowledgeBasePage,
});
