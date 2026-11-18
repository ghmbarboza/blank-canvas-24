import { createFileRoute } from "@tanstack/react-router";

import { SdrPage } from "@/features/sdr/SdrPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/sdr")({
  head: () =>
    pageHead(
      "Pontuação e rodízio",
      "Nota preditiva do lead, horário ideal e roteamento automático.",
    ),
  component: SdrPage,
});
