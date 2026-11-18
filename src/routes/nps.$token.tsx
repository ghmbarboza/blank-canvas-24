import { createFileRoute } from "@tanstack/react-router";

import { SurveyPage } from "@/features/support/public/SurveyPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/nps/$token")({
  head: () => pageHead("Pesquisa rápida", "De 0 a 10, quanto você nos recomendaria?"),
  component: NpsRoute,
});

function NpsRoute() {
  const { token } = Route.useParams();
  return <SurveyPage kind="nps" token={token} />;
}
