import { createFileRoute } from "@tanstack/react-router";

import { CampaignsPage } from "@/features/email/CampaignsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/campanhas/")({
  head: () => pageHead("Campanhas", "Campanhas de e-mail marketing no Nexus One."),
  component: CampaignsPage,
});
