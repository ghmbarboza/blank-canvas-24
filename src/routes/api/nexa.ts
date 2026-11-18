import { createFileRoute } from "@tanstack/react-router";

// Nexa em streaming (modal). POST { accountId, text } → UI message stream do AI SDK.
// O histórico é lido do banco; do navegador só vem a fala atual. Só dono e administrador.
export const Route = createFileRoute("/api/nexa")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{ accountId?: string; text?: string; retry?: boolean }>(
            req,
          );
          const caller = await h.requireMember(req, body.accountId, "admin");
          const text = String(body.text ?? "").trim();
          if (!text) throw new h.HttpError(400, "Escreva uma mensagem", "empty");
          await h.rateLimit(`setup-chat:${caller.userId}`, 40, 600);
          const { streamNexa } = await import("@/backend/setup-agent/nexa.server");
          return streamNexa(req, caller, text, body.retry === true);
        })(ctx);
      },
    },
  },
});
