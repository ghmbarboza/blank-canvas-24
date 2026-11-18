import { createFileRoute } from "@tanstack/react-router";

import { ContactDetailPage } from "@/features/contacts/components/detail/ContactDetailPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/contatos/$contactId")({
  head: () => pageHead("Detalhes do contato", "Histórico e informações de um contato na Central de CS."),
  component: ContactPage,
});

function ContactPage() {
  const { contactId } = Route.useParams();
  return <ContactDetailPage key={contactId} contactId={contactId} />;
}
