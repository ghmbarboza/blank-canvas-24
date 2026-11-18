import { createFileRoute } from "@tanstack/react-router";

// Webhook da Composio (gatilhos: e-mail novo no Gmail/Outlook vira conversa de e-mail).
// A conta vem do user_id do evento ("nexus-<conta>"); a assinatura é conferida com o segredo
// guardado no Vault da própria conta. GET/HEAD respondem 200 (monitor e navegador batem antes).
export const Route = createFileRoute("/api/public/composio")({
  server: {
    handlers: {
      GET: async () =>
        (await import("@/backend/http.server")).json({ ok: true, service: "composio" }),
      HEAD: async () => new Response(null, { status: 200 }),
      POST: async ({ request }) => {
        const h = await import("@/backend/http.server");
        try {
          await h.rateLimit(`composio:${h.trustedIp(request)}`, 600, 60);
          const raw = await request.text();
          if (raw.length > 2_000_000)
            return h.json({ ok: false, error: "corpo grande demais" }, 413);
          const { handleComposioWebhook } = await import("@/backend/agents/composio.server");
          const r = await handleComposioWebhook(raw, {
            id: request.headers.get("webhook-id"),
            timestamp: request.headers.get("webhook-timestamp"),
            signature: request.headers.get("webhook-signature"),
          });
          return h.json({ ok: r.status === 200, message: r.message }, r.status);
        } catch (err) {
          if (err instanceof h.HttpError)
            return h.json({ ok: false, error: err.message }, err.status);
          console.error("[composio] webhook", err);
          return h.json({ ok: false, error: "falha ao registrar o evento" }, 500);
        }
      },
    },
  },
});
