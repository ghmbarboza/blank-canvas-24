import { createFileRoute } from "@tanstack/react-router";

import { TemplatesPage } from "@/features/email/TemplatesPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/campanhas/modelos")({
  head: () => pageHead("Modelos de e-mail", "Modelos para campanhas, avisos e e-mail do vendedor."),
  component: TemplatesPage,
});
