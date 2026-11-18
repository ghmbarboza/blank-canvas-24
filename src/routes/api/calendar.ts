import { createFileRoute } from "@tanstack/react-router";

// Agenda pessoal do vendedor (legado): "start" foi retirado (410; a agenda entra pela Zernio);
// "disconnect" apaga a autorização do Vault e a conexão antigas.
export const Route = createFileRoute("/api/calendar")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const cal = await import("@/backend/calendar/oauth.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{ accountId?: string; action?: string; provider?: string }>(
            req,
          );
          const caller = await h.requireMember(req, body.accountId, "member");
          const provider = body.provider;
          if (provider !== "google" && provider !== "microsoft")
            throw new h.HttpError(400, "Provedor inválido", "bad_provider");
          // Agenda direta do Google/Microsoft saiu da tela (agora é pela Zernio). Conectar de novo
          // por aqui não vale mais; desconectar fica para limpar o que já existe (S11).
          if (body.action === "start")
            throw new h.HttpError(
              410,
              "A agenda do Google e do Outlook agora conecta pela Zernio, em Canais.",
              "retired",
            );
          if (body.action === "disconnect") {
            await cal.disconnect(caller.accountId, caller.userId, provider);
            return h.json({ ok: true });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
