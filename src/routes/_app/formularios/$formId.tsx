import { createFileRoute } from "@tanstack/react-router";

import { FormBuilder } from "@/features/forms/FormBuilder";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/formularios/$formId")({
  head: () => pageHead("Formulário", "Campos, consentimento, destino do contato e publicação."),
  component: FormRoute,
});

function FormRoute() {
  const { formId } = Route.useParams();
  return <FormBuilder key={formId} formId={formId} />;
}
