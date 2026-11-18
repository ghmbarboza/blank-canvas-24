import { createFileRoute } from "@tanstack/react-router";

import { SdrPage } from "@/features/sdr/SdrPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/sdr")({
  head: () =>
    pageHead("Pontuação e rodízio", "Nota do contato, horário ideal e rodízio automático."),
  component: SdrPage,
});
