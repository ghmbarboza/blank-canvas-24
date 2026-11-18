import { createFileRoute } from "@tanstack/react-router";

import { ManageMeetingPage, type ManageIntent } from "@/features/meetings/manage/ManageMeetingPage";
import { pageHead } from "@/lib/page-head";

// Link público do convite para o cliente confirmar, remarcar ou cancelar (sem login).
export const Route = createFileRoute("/reuniao/$token")({
  validateSearch: (search: Record<string, unknown>): { acao?: ManageIntent } => {
    const a = search["acao"];
    return a === "confirmar" || a === "remarcar" ? { acao: a } : {};
  },
  head: () => pageHead("Sua reunião", "Confirme, remarque ou cancele sua reunião."),
  component: ReuniaoRoute,
});

function ReuniaoRoute() {
  const { token } = Route.useParams();
  const { acao } = Route.useSearch();
  return <ManageMeetingPage key={token} token={token} intent={acao ?? null} />;
}
