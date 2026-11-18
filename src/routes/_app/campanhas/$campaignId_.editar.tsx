import { createFileRoute } from "@tanstack/react-router";

import { CampaignEditor } from "@/features/email/CampaignEditor";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/campanhas/$campaignId_/editar")({
  head: () => pageHead("Editar campanha", "Público, conteúdo, teste e disparo da campanha."),
  component: EditorRoute,
});

function EditorRoute() {
  const { campaignId } = Route.useParams();
  return <CampaignEditor key={campaignId} campaignId={campaignId} />;
}
