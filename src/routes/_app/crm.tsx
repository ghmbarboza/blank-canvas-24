import { createFileRoute } from "@tanstack/react-router";

import { CrmPage } from "@/features/crm/components/CrmPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/crm")({
  validateSearch: (search: Record<string, unknown>): { negocio?: string | undefined } => {
    const v = search["negocio"];
    return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? { negocio: v } : {};
  },
  head: () => pageHead("CRM", "Oportunidades de vendas e funil comercial na Central de CS."),
  component: CrmPage,
});
