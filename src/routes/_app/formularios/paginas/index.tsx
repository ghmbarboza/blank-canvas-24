import { createFileRoute } from "@tanstack/react-router";

import { LandingPagesPage } from "@/features/forms/LandingPages";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/formularios/paginas/")({
  head: () => pageHead("Landing pages", "Páginas de campanha com formulário."),
  component: LandingPagesPage,
});
