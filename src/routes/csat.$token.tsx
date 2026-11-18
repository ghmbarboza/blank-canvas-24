import { createFileRoute } from "@tanstack/react-router";

import { SurveyPage } from "@/features/support/public/SurveyPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/csat/$token")({
  head: () => pageHead("Avalie o atendimento", "Conte como foi o seu atendimento."),
  component: CsatRoute,
});

function CsatRoute() {
  const { token } = Route.useParams();
  return <SurveyPage kind="csat" token={token} />;
}
