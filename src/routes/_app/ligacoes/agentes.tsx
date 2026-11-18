import { createFileRoute } from "@tanstack/react-router";

import { VoiceAgentsPage } from "@/features/telephony/VoiceAgentsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/ligacoes/agentes")({
  head: () => pageHead("Agentes de voz", "IA que atende e liga em português com contexto do CRM."),
  component: VoiceAgentsPage,
});
