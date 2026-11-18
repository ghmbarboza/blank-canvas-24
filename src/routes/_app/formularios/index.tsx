import { createFileRoute } from "@tanstack/react-router";

import { FormsPage } from "@/features/forms/FormsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/formularios/")({
  head: () => pageHead("Captação", "Formulários, landing pages e origem dos leads."),
  component: FormsPage,
});
