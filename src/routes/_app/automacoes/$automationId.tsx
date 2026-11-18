import { createFileRoute } from "@tanstack/react-router";

import { AutomationEditor } from "@/features/automations/AutomationEditor";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_app/automacoes/$automationId")({
  head: () => pageHead("Editor de automação", "Fluxo, gatilho, regras e inscritos."),
  component: AutomationRoute,
});

function AutomationRoute() {
  const { automationId } = Route.useParams();
  return <AutomationEditor key={automationId} automationId={automationId} />;
}
