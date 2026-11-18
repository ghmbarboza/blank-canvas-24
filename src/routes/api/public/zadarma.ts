import { createFileRoute } from "@tanstack/react-router";

// Webhooks da Zadarma (notify_*). A Zadarma valida a URL com GET ?zd_echo=<valor>: devolvemos o eco.
// URL a cadastrar no painel da Zadarma: /api/public/zadarma?a=<id da conta> (Ajustes › Telefonia mostra pronta).
export const Route = createFileRoute("/api/public/zadarma")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const echo = new URL(request.url).searchParams.get("zd_echo");
        return new Response(echo ?? "ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const { handleZadarmaNotify } =
            await import("@/backend/telephony/zadarma-webhook.server");
          return handleZadarmaNotify(req);
        })(ctx);
      },
    },
  },
});
