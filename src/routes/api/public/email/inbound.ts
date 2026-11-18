import { createFileRoute } from "@tanstack/react-router";

// E-mail recebido (Resend Inbound ou encaminhamento): vira conversa na caixa de entrada.
// URL: /api/public/email/inbound?a=<conta>&t=<token do canal de e-mail> (mostrada em Ajustes › E-mail).
export const Route = createFileRoute("/api/public/email/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json } = await import("@/backend/http.server");
        const url = new URL(request.url);
        try {
          const payload = (await request.json()) as Record<string, unknown>;
          const { handleInbound } = await import("@/backend/email/events.server");
          const r = await handleInbound(
            url.searchParams.get("a") ?? "",
            url.searchParams.get("t") ?? "",
            payload,
          );
          return json({ ok: r.status === 200, message: r.message }, r.status);
        } catch (err) {
          console.error("[email] inbound", err);
          return json({ ok: false, error: "falha ao registrar o e-mail" }, 500);
        }
      },
    },
  },
});
