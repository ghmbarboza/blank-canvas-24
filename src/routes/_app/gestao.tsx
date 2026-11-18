import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { GESTAO_TABS, GestaoPage, type GestaoTab } from "@/features/gestao/GestaoPage";
import { pageHead } from "@/lib/page-head";

interface GestaoSearch {
  aba?: GestaoTab | undefined;
}

export const Route = createFileRoute("/_app/gestao")({
  validateSearch: (search: Record<string, unknown>): GestaoSearch => {
    const aba = search["aba"];
    return (GESTAO_TABS as readonly string[]).includes(String(aba))
      ? { aba: aba as GestaoTab }
      : {};
  },
  head: () =>
    pageHead("Gestão", "Escala, indicadores, saúde dos clientes, importação e outro CRM."),
  component: GestaoRoute,
});

function GestaoRoute() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <GestaoPage
      tab={aba ?? "escala"}
      onTabChange={(t) =>
        void navigate({ to: "/gestao", search: t === "escala" ? {} : { aba: t }, replace: true })
      }
    />
  );
}
