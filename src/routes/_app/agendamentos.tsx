import { createFileRoute } from "@tanstack/react-router";

import { BookingPagesPage } from "@/features/booking/BookingPagesPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/agendamentos")({
  head: () => pageHead("Agendamentos", "Links públicos para o cliente marcar reunião sozinho."),
  component: BookingPagesPage,
});
