import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ReportsPage } from "@/features/reports/ReportsPage";
import { pageHead } from "@/lib/page-head";

// "Qual campanha deu retorno": o relatório de origem em tela própria, sem as abas de Relatórios.
export const Route = createFileRoute("/_app/origem")({
  head: () => pageHead("Origem dos leads", "De onde vêm os leads e qual campanha deu retorno."),
  component: OriginRoute,
});

function OriginRoute() {
  const navigate = useNavigate();
  return (
    <ReportsPage
      tab="atribuicao"
      standalone
      onTabChange={(t) =>
        void navigate({ to: "/relatorios", search: t === "vendas" ? {} : { aba: t } })
      }
    />
  );
}
