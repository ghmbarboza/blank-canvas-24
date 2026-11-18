import { createFileRoute } from "@tanstack/react-router";

import { CrmPage } from "@/features/crm/components/CrmPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/crm")({
  validateSearch: (search: Record<string, unknown>): { negocio?: string | undefined } => {
    const v = search["negocio"];
    return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? { negocio: v } : {};
  },
  head: () => pageHead("Carteira", "Seus clientes, etapa por etapa da jornada de pós-venda."),
  component: CrmPage,
});
