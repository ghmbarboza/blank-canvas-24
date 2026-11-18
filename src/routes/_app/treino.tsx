import { createFileRoute } from "@tanstack/react-router";

import { TrainingPage } from "@/features/training/TrainingPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/treino")({
  head: () =>
    pageHead("Treino", "Conversa de treino com cliente simulado pela IA e nota pelo roteiro."),
  component: TrainingPage,
});
