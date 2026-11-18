import { createFileRoute } from "@tanstack/react-router";

import { ProposalPublicPage } from "@/features/commerce/public/ProposalPublicPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/proposta/$token")({
  head: () => pageHead("Proposta", "Proposta comercial com aceite online."),
  component: ProposalRoute,
});

function ProposalRoute() {
  const { token } = Route.useParams();
  return <ProposalPublicPage token={token} />;
}
