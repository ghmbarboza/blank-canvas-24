import { createFileRoute } from "@tanstack/react-router";

import { CampaignDetail } from "@/features/email/CampaignDetail";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/campanhas/$campaignId")({
  head: () => pageHead("Campanha", "Resultado da campanha de e-mail."),
  component: CampaignRoute,
});

function CampaignRoute() {
  const { campaignId } = Route.useParams();
  return <CampaignDetail key={campaignId} campaignId={campaignId} />;
}
