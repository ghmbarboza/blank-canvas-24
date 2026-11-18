import { createFileRoute } from "@tanstack/react-router";

// Webhook da ZapSign: /api/public/zapsign?account=<conta>&t=<token do webhook cadastrado na integração>.
// A ZapSign não assina o corpo; o token na URL é o segredo, comparado em tempo constante.
export const Route = createFileRoute("/api/public/zapsign")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const sig = await import("@/backend/signature.server");
        return h.handle(async (req) => {
          const url = new URL(req.url);
          const account = url.searchParams.get("account");
          const token = url.searchParams.get("t") ?? "";
          if (!h.isUuid(account) || !token)
            throw new h.HttpError(400, "Informe ?account= e ?t= na URL do webhook", "bad_params");
          await h.rateLimit(`zapsign:${account}`, 120, 60);
          const ev = await h.readJson<Parameters<typeof sig.handleWebhook>[3]>(req);
          return h.json(await sig.handleWebhook(req, account, token, ev));
        })(ctx);
      },
    },
  },
});
