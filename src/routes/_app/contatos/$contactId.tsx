import { createFileRoute } from "@tanstack/react-router";

import { ContactDetailPage } from "@/features/contacts/components/detail/ContactDetailPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/contatos/$contactId")({
  head: () => pageHead("Ficha do cliente", "Saúde, histórico e conversas de um cliente."),
  component: ContactPage,
});

function ContactPage() {
  const { contactId } = Route.useParams();
  return <ContactDetailPage key={contactId} contactId={contactId} />;
}
