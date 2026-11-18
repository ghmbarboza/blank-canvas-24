import { createFileRoute } from "@tanstack/react-router";

// Web Push: GET entrega a chave VAPID pública (o navegador precisa dela para se inscrever);
// POST { accountId, action: "test" } manda uma notificação de teste para quem pediu.
export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async () => {
          const { vapidKeys } = await import("@/backend/push/send.server");
          const keys = await vapidKeys();
          if (!keys)
            throw new h.HttpError(503, "Push no navegador ainda não configurado", "no_vapid");
          return h.json({ publicKey: keys.publicKey }, 200, {
            "cache-control": "public, max-age=3600",
          });
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{ accountId?: string; action?: string }>(req);
          const caller = await h.requireMember(req, body.accountId, "member");
          if (body.action !== "test") throw new h.HttpError(400, "Ação inválida", "bad_action");
          await h.rateLimit(`push:test:${caller.userId}`, 5, 600);
          const { error } = await h.admin().rpc("notify_user", {
            _account: caller.accountId,
            _user: caller.userId,
            _kind: "test",
            _title: "Teste de notificação",
            _body: "Se você está vendo isto, os avisos estão chegando.",
            _link: "/ajustes?aba=notificacoes",
          });
          if (error) throw new h.HttpError(500, "Não deu para enviar o teste", "notify_failed");
          return h.json({ ok: true });
        })(ctx);
      },
    },
  },
});
