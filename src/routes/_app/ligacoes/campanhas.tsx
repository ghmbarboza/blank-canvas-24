import { createFileRoute } from "@tanstack/react-router";

import { VoiceCampaignsPage } from "@/features/telephony/VoiceCampaignsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/ligacoes/campanhas")({
  head: () =>
    pageHead("Campanhas de voz", "A IA de voz liga para um segmento dentro da janela definida."),
  component: VoiceCampaignsPage,
});
