import { createFileRoute } from "@tanstack/react-router";

import { ContactsPage } from "@/features/contacts/components/ContactsPage";
import { isMomentKey, type MomentKey } from "@/features/posvenda/moment";
import { pageHead } from "@/lib/page-head";

interface Search {
  /** Abre a lista já filtrada por um momento do pós-venda (atalho do Painel). */
  momento?: MomentKey | undefined;
}

export const Route = createFileRoute("/_app/contatos/")({
  validateSearch: (s: Record<string, unknown>): Search =>
    isMomentKey(s["momento"]) ? { momento: s["momento"] } : {},
  head: () => pageHead("Clientes", "Seus clientes, a saúde de cada um e quem ainda não comprou."),
  component: ContactsPage,
});
