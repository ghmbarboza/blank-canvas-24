import { createFileRoute } from "@tanstack/react-router";

// Webhook do Resend (assinatura svix): entrega, bounce e reclamação. URL: /api/public/resend?a=<conta>.
// Sem segredo salvo responde 412 e marca a integração com erro: nunca 200 em silêncio.
export const Route = createFileRoute("/api/public/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json } = await import("@/backend/http.server");
        const accountId = new URL(request.url).searchParams.get("a") ?? "";
        const body = await request.text();
        try {
          const { handleResendWebhook } = await import("@/backend/email/events.server");
          const r = await handleResendWebhook(accountId, request.headers, body);
          return json({ ok: r.status === 200, message: r.message }, r.status);
        } catch (err) {
          console.error("[resend] webhook", err);
          return json({ ok: false, error: "falha ao processar" }, 500);
        }
      },
    },
  },
});
