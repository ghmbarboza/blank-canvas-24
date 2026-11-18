import { createFileRoute } from "@tanstack/react-router";

import { RoutingPage } from "@/features/queue/RoutingPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/fila/roteamento")({
  head: () => pageHead("Fila e roteamento", "Equipe, habilidades, capacidade, filas e regras."),
  component: RoutingPage,
});
