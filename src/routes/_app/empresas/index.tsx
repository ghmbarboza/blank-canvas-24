import { createFileRoute } from "@tanstack/react-router";

import { CompaniesPage } from "@/features/companies/CompaniesPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/empresas/")({
  head: () => pageHead("Empresas", "Contas, pessoas e negócios por empresa no Vínculo."),
  component: CompaniesPage,
});
