import { createFileRoute } from "@tanstack/react-router";

import { ContactsPage } from "@/features/contacts/components/ContactsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/contatos/")({
  head: () => pageHead("Clientes", "Seus clientes, a saúde de cada um e quem ainda não comprou."),
  component: ContactsPage,
});
