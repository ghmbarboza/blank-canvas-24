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
          try {
            return await streamNexa(req, caller, text, body.retry === true);
          } catch (err) {
            // IA sem crédito, sem chave ou acima do teto: a pessoa lê o motivo, não "Erro interno"
            if (err instanceof h.HttpError) throw err;
            const { friendlyStreamError } = await import("@/backend/setup-agent/nexa-tools");
            console.error("[assistente] antes do stream", err instanceof Error ? err.message : err);
            throw new h.HttpError(503, friendlyStreamError(err), "assistant_unavailable");
          }
        })(ctx);
      },
    },
  },
});
