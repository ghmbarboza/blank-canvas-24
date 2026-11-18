import { createFileRoute } from "@tanstack/react-router";

import { HelpCenterPage } from "@/features/help/HelpCenterPage";
import { pageHead } from "@/lib/page-head";

// Ajuda de quem opera a Central de CS. A central pública do cliente final é /ajuda/$slug.
export const Route = createFileRoute("/_app/central-de-ajuda/")({
  head: () => pageHead("Ajuda", "Perguntas frequentes e guias passo a passo da Central de CS."),
  component: HelpCenterPage,
});
