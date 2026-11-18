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
    pageHead(
      "Saúde da carteira",
      "Clientes saudáveis, em atenção e em risco, e a escala da equipe.",
    ),
  component: GestaoRoute,
});

function GestaoRoute() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <GestaoPage
      // Na Central de CS o menu chama esta tela de "Saúde da carteira": abre direto nessa aba.
      tab={aba ?? "clientes"}
      onTabChange={(t) =>
        void navigate({ to: "/gestao", search: t === "clientes" ? {} : { aba: t }, replace: true })
      }
    />
  );
}
