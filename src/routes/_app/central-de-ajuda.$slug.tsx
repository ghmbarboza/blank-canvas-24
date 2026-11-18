import { createFileRoute } from "@tanstack/react-router";

import { guideBySlug } from "@/features/help/content";
import { HelpGuidePage } from "@/features/help/HelpGuidePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/central-de-ajuda/$slug")({
  head: ({ params }) =>
    pageHead(guideBySlug(params.slug)?.titulo ?? "Guia", "Guia passo a passo da Central de CS."),
  component: GuideRoute,
});

function GuideRoute() {
  const { slug } = Route.useParams();
  return <HelpGuidePage guide={guideBySlug(slug)} />;
}
