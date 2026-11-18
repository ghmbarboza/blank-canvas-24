import { createFileRoute } from "@tanstack/react-router";

import { PosVendaPage } from "@/features/posvenda/PosVendaPage";
import { pageHead } from "@/lib/page-head";

// Regras de pós-venda: o dono liga e desliga cada regra pronta.
export const Route = createFileRoute("/_app/pos-venda")({
  head: () => pageHead("Regras de pós-venda", "Ligue as regras prontas de pós-venda."),
  component: PosVendaPage,
});
