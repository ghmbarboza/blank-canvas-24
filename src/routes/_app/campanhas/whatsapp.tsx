import { createFileRoute } from "@tanstack/react-router";

import { WaCampaignsPage } from "@/features/whatsapp-campaigns/WaCampaignsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/campanhas/whatsapp")({
  head: () =>
    pageHead("Campanhas de WhatsApp", "Campanhas de WhatsApp com modelo aprovado no Vínculo."),
  component: WaCampaignsPage,
});
