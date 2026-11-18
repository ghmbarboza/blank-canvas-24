import { createFileRoute } from "@tanstack/react-router";

// Webhook único da Zernio por conta: WhatsApp, redes, ligações e eventos de número.
// URL registrada sozinha ao salvar a chave: /api/public/zernio?a=<id da conta>.
// GET e HEAD respondem 200: monitor e navegador tocam a porta antes do primeiro evento.
export const Route = createFileRoute("/api/public/zernio")({
  server: {
    handlers: {
      GET: async () =>
        new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
      HEAD: async () => new Response(null, { status: 200 }),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const { handleZernioWebhook } = await import("@/backend/providers/zernio-webhook.server");
          return handleZernioWebhook(req);
        })(ctx);
      },
    },
  },
});
