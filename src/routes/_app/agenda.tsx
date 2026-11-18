import { createFileRoute } from "@tanstack/react-router";

import { AgendaPage } from "@/features/agenda/AgendaPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/agenda")({
  head: () => pageHead("Agenda", "Compromissos e atividades da sua equipe no Vínculo."),
  component: AgendaPage,
});
