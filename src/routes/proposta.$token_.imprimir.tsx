import { createFileRoute } from "@tanstack/react-router";

import { ProposalPublicPage } from "@/features/commerce/public/ProposalPublicPage";
import { pageHead } from "@/lib/page-head";

// Versão para imprimir ou salvar em PDF pelo navegador (abre o diálogo de impressão sozinha).
export const Route = createFileRoute("/proposta/$token_/imprimir")({
  head: () => pageHead("Proposta (PDF)", "Versão para impressão da proposta comercial."),
  component: PrintRoute,
});

function PrintRoute() {
  const { token } = Route.useParams();
  return <ProposalPublicPage token={token} print />;
}
