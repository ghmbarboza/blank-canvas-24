import { createFileRoute } from "@tanstack/react-router";

import { PublicBookingPage } from "@/features/booking/PublicBookingPage";
import { pageHead } from "@/lib/page-head";

// Link público de agendamento (sem login).
export const Route = createFileRoute("/agendar/$slug")({
  head: () =>
    pageHead("Agendar reunião", "Escolha um horário livre e receba o convite com o link da sala."),
  component: AgendarRoute,
});

function AgendarRoute() {
  const { slug } = Route.useParams();
  return <PublicBookingPage slug={slug} />;
}
