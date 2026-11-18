import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { HelpCenterPage } from "@/features/support/public/HelpCenterPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/ajuda/$slug")({
  validateSearch: (s: Record<string, unknown>): { artigo?: string | undefined } =>
    typeof s["artigo"] === "string" && /^[a-z0-9-]{1,120}$/.test(s["artigo"])
      ? { artigo: s["artigo"] }
      : {},
  head: () => pageHead("Central de ajuda", "Respostas para as dúvidas mais comuns."),
  component: HelpRoute,
});

function HelpRoute() {
  const { slug } = Route.useParams();
  const { artigo } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <HelpCenterPage
      slug={slug}
      article={artigo ?? null}
      onOpen={(a) =>
        void navigate({ to: "/ajuda/$slug", params: { slug }, search: a ? { artigo: a } : {} })
      }
    />
  );
}
