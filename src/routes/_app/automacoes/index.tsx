import { createFileRoute } from "@tanstack/react-router";

import { AutomationsPage } from "@/features/automations/AutomationsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/automacoes/")({
  head: () =>
    pageHead("Automações", "Jornadas do cliente, cadências de contato e regras automáticas."),
  component: AutomationsPage,
});
