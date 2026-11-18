import { createFileRoute } from "@tanstack/react-router";

import { LandingBuilder } from "@/features/forms/LandingPages";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/formularios/paginas/$pageId")({
  head: () => pageHead("Editar página", "Blocos, formulário e publicação."),
  component: PageRoute,
});

function PageRoute() {
  const { pageId } = Route.useParams();
  return <LandingBuilder key={pageId} pageId={pageId} />;
}
