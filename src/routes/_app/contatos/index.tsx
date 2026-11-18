import { createFileRoute } from "@tanstack/react-router";

import { ContactsPage } from "@/features/contacts/components/ContactsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/contatos/")({
  head: () => pageHead("Contatos", "Contatos e clientes da sua empresa no Nexus One."),
  component: ContactsPage,
});
