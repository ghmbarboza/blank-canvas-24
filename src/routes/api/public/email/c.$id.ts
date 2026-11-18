import { createFileRoute } from "@tanstack/react-router";

// Clique rastreado: só redireciona para um link que estava no próprio e-mail (sem redirecionamento aberto).
export const Route = createFileRoute("/api/public/email/c/$id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.pathname.split("/").pop() ?? "";
        const target = url.searchParams.get("u") ?? "";
        const cta = url.searchParams.get("c");
        try {
          const { trackClick } = await import("@/backend/email/events.server");
          const dest = await trackClick(
            id,
            target,
            cta,
            request.headers.get("user-agent"),
            request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
          );
          if (dest)
            return new Response(null, {
              status: 302,
              headers: { location: dest, "cache-control": "no-store" },
            });
        } catch (err) {
          console.error("[email] clique", err);
        }
        return new Response("Link inválido ou expirado.", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
