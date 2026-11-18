import { createFileRoute } from "@tanstack/react-router";

import { IncidentsPage } from "@/features/incidents/IncidentsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/incidentes")({
  head: () =>
    pageHead("Incidentes", "Chamados iguais agrupados, aviso em lote e página de status pública."),
  component: IncidentsPage,
});
