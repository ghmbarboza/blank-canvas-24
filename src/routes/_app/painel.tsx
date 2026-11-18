import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { pageHead } from "@/lib/page-head";

// Toda conta começa aqui, gestor ou atendente.
export const Route = createFileRoute("/_app/painel")({
  head: () =>
    pageHead(
      "Painel",
      "Clientes ativos e em risco, conversas aguardando, satisfação e regras de pós-venda.",
    ),
  component: DashboardPage,
});
