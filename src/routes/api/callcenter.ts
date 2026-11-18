import { createFileRoute } from "@tanstack/react-router";

// Call center (usuário logado). action:
//   zadarma_check | supervisor_enable | supervise_info | transfer_brief | regenerate_wrap
export const Route = createFileRoute("/api/callcenter")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            [k: string]: unknown;
          }>(req);
          const a = await import("@/backend/routing/callcenter.server");
          switch (body.action) {
            case "zadarma_check": {
              const c = await h.requireMember(req, body.accountId, "manager");
              await h.rateLimit(`cc:zcheck:${c.accountId}`, 10, 600);
              return h.json(await a.zadarmaCheck(c));
            }
            case "supervisor_enable": {
              const c = await h.requireMember(req, body.accountId, "manager");
              await h.rateLimit(`cc:sup:${c.userId}`, 5, 600);
              return h.json(await a.supervisorEnable(c));
            }
            case "supervise_info":
              return h.json(
                await a.superviseInfo(await h.requireMember(req, body.accountId, "manager"), body),
              );
            case "transfer_brief": {
              const c = await h.requireMember(req, body.accountId);
              await h.rateLimit(`cc:transfer:${c.userId}`, 30, 600);
              return h.json(await a.transferBrief(c, body));
            }
            case "regenerate_wrap": {
              const c = await h.requireMember(req, body.accountId);
              await h.rateLimit(`cc:wrap:${c.userId}`, 10, 600);
              return h.json(await a.regenerateWrap(c, body));
            }
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
