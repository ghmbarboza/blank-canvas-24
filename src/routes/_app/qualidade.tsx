import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { QualityPage, type QualityTab } from "@/features/quality/QualityPage";
import { pageHead } from "@/lib/page-head";

const TABS: QualityTab[] = [
  "visao",
  "notas",
  "formularios",
  "calibracao",
  "contestacoes",
  "ajustes",
];

export const Route = createFileRoute("/_app/qualidade")({
  validateSearch: (s: Record<string, unknown>): { aba?: QualityTab | undefined } =>
    TABS.includes(s["aba"] as QualityTab) ? { aba: s["aba"] as QualityTab } : {},
  head: () =>
    pageHead("Qualidade", "Nota da IA em todas as interações, com calibração e contestação."),
  component: QualityRoute,
});

function QualityRoute() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <QualityPage
      tab={aba ?? "visao"}
      onTab={(t) => void navigate({ to: "/qualidade", search: { aba: t }, replace: true })}
    />
  );
}
