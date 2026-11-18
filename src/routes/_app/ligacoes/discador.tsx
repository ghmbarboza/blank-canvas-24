import { createFileRoute } from "@tanstack/react-router";

import { DialerPage } from "@/features/telephony/dialer/DialerPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/ligacoes/discador")({
  head: () => pageHead("Discador", "Ligue para uma lista em sequência, no modo preview ou power."),
  component: DialerPage,
});
