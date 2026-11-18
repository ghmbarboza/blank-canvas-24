import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { TicketsPage } from "@/features/support/TicketsPage";
import { pageHead } from "@/lib/page-head";

interface Search {
  chamado?: string | undefined;
  aba?: "pesquisas" | undefined;
}

export const Route = createFileRoute("/_app/atendimento/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["chamado"] === "string" && /^[0-9a-f-]{36}$/i.test(s["chamado"])
      ? { chamado: s["chamado"] }
      : {}),
    ...(s["aba"] === "pesquisas" ? { aba: "pesquisas" as const } : {}),
  }),
  head: () => pageHead("Atendimento", "Chamados com SLA, pesquisas de satisfação e agente de IA."),
  component: SupportRoute,
});

function SupportRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <TicketsPage
      ticketId={search.chamado ?? null}
      tab={search.aba ?? "chamados"}
      onOpenTicket={(id) =>
        void navigate({
          to: "/atendimento",
          search: { ...(id ? { chamado: id } : {}), ...(search.aba ? { aba: search.aba } : {}) },
          replace: true,
        })
      }
      onTab={(t) =>
        void navigate({
          to: "/atendimento",
          search: t === "pesquisas" ? { aba: "pesquisas" } : {},
          replace: true,
        })
      }
    />
  );
}
