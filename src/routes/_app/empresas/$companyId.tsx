import { createFileRoute } from "@tanstack/react-router";

import { CompanyDetailPage } from "@/features/companies/CompanyDetailPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/empresas/$companyId")({
  head: () => pageHead("Empresa", "Pessoas, carteira e dados da empresa."),
  component: CompanyRoute,
});

function CompanyRoute() {
  const { companyId } = Route.useParams();
  return <CompanyDetailPage key={companyId} companyId={companyId} />;
}
