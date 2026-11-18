import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PortalPage } from "@/features/support/public/PortalPage";

export const Route = createFileRoute("/portal/$slug")({
  validateSearch: (s: Record<string, unknown>): { acesso?: string | undefined } =>
    typeof s["acesso"] === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(s["acesso"])
      ? { acesso: s["acesso"] }
      : {},
  head: () => ({
    meta: [{ title: "Seus chamados" }, { name: "robots", content: "noindex" }],
  }),
  component: PortalRoute,
});

function PortalRoute() {
  const { slug } = Route.useParams();
  const { acesso } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PortalPage
      slug={slug}
      accessToken={acesso ?? null}
      // Tira o token da barra de endereço depois de usar (não fica no histórico nem no print).
      onConsumeToken={() =>
        void navigate({ to: "/portal/$slug", params: { slug }, search: {}, replace: true })
      }
    />
  );
}
