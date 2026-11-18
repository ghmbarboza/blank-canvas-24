import { createFileRoute } from "@tanstack/react-router";

import { LivePage } from "@/features/queue/LivePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/fila/painel")({
  head: () => pageHead("Painel ao vivo", "Fila, equipe e prazo do dia em tempo real."),
  component: LivePage,
});
