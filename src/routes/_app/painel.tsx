import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { pageHead } from "@/lib/page-head";

// Toda conta começa aqui, gestor ou atendente.
export const Route = createFileRoute("/_app/painel")({
  head: () => pageHead("Painel", "Indicadores de atendimento e vendas na Central de CS."),
  component: DashboardPage,
});
