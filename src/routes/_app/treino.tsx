import { createFileRoute } from "@tanstack/react-router";

import { TrainingPage } from "@/features/training/TrainingPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/treino")({
  head: () =>
    pageHead("Treino", "Roleplay de vendas com cliente simulado pela IA e nota pelo playbook."),
  component: TrainingPage,
});
