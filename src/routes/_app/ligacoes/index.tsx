import { createFileRoute } from "@tanstack/react-router";

import { CallsPage } from "@/features/telephony/CallsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/ligacoes/")({
  // ?chamada=<id> abre o detalhe de uma ligação (links da biblioteca e da linha do tempo)
  validateSearch: (s: Record<string, unknown>): { chamada?: string } =>
    typeof s["chamada"] === "string" ? { chamada: s["chamada"] } : {},
  head: () => pageHead("Ligações", "Fila ao vivo, histórico, gravações e resumos das ligações."),
  component: CallsPage,
});
