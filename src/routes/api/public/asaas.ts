import { createFileRoute } from "@tanstack/react-router";

// Webhook do Asaas (no Asaas: Integrações › Webhooks, token = o da integração no Vínculo).
export const Route = createFileRoute("/api/public/asaas")({
  server: {
    handlers: {
      GET: async () =>
        (await import("@/backend/http.server")).json({ ok: true, service: "asaas-webhook" }),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const c = await import("@/backend/commerce.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Record<string, unknown>>(req);
          const result = await c.handleAsaasWebhook(
            body as never,
            req.headers.get("asaas-access-token"),
            new URL(req.url).searchParams.get("a"),
          );
          return h.json(result);
        })(ctx);
      },
    },
  },
});
