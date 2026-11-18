import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { REPORT_TABS, ReportsPage, type ReportTab } from "@/features/reports/ReportsPage";
import { pageHead } from "@/lib/page-head";

interface ReportsSearch {
  aba?: ReportTab | undefined;
  relatorio?: string | undefined;
}

export const Route = createFileRoute("/_app/relatorios")({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => {
    const aba = search["aba"];
    const rel = search["relatorio"];
    return {
      ...((REPORT_TABS as readonly string[]).includes(String(aba))
        ? { aba: aba as ReportTab }
        : {}),
      ...(typeof rel === "string" && /^[0-9a-f-]{36}$/i.test(rel) ? { relatorio: rel } : {}),
    };
  },
  head: () =>
    pageHead("Relatórios", "Vendas, forecast, atribuição, atendimento, ligações, reuniões e IA."),
  component: ReportsRoute,
});

function ReportsRoute() {
  const { aba, relatorio } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <ReportsPage
      tab={aba ?? "vendas"}
      reportId={relatorio}
      onTabChange={(t) =>
        void navigate({
          to: "/relatorios",
          search: t === "vendas" ? {} : { aba: t },
          replace: true,
        })
      }
    />
  );
}
