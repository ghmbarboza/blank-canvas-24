import { createFileRoute } from "@tanstack/react-router";

import { StatusPage } from "@/features/support/public/StatusPage";

export const Route = createFileRoute("/status/$slug")({
  head: () => ({ meta: [{ title: "Status do serviço" }] }),
  component: StatusRoute,
});

function StatusRoute() {
  const { slug } = Route.useParams();
  return <StatusPage slug={slug} />;
}
