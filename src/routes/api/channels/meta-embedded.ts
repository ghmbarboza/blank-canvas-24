import { createFileRoute } from "@tanstack/react-router";

import type { EmbeddedInput } from "@/backend/meta-embedded.server";

// WhatsApp oficial em 1 clique. action "config": a plataforma ativou? (app e config públicos para o
// SDK da Meta). action "connect": recebe o code do pop-up da Meta e cria o canal.
export const Route = createFileRoute("/api/channels/meta-embedded")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const me = await import("@/backend/meta-embedded.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{ accountId?: string; action?: string } & EmbeddedInput>(
            req,
          );
          const caller = await h.requireMember(req, body.accountId, "manager");
          if (body.action === "config") {
            const m = await me.platformMeta();
            return h.json(
              me.isEmbeddedReady(m)
                ? { ready: true, appId: m.app_id, configId: m.config_id }
                : { ready: false },
            );
          }
          if (body.action !== "connect") throw new h.HttpError(400, "Ação inválida", "bad_action");
          await h.rateLimit(`meta-embedded:${caller.accountId}`, 10, 3600);
          return h.json(await me.connectEmbedded(caller.accountId, body));
        })(ctx);
      },
    },
  },
});
