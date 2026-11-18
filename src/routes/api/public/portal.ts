import { createFileRoute } from "@tanstack/react-router";

// Portal do cliente (público): link mágico, lista e detalhe dos chamados do próprio cliente,
// abrir chamado e responder. A sessão é um token assinado no header Authorization.
export const Route = createFileRoute("/api/public/portal")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Record<string, unknown>>(req, 8 * 1024);
          const p = await import("@/backend/support/portal.server");
          switch (body["action"]) {
            case "info": {
              const acc = await p.accountBySlug(body["slug"]);
              return h.json({ company: acc.name });
            }
            case "request":
              return h.json(await p.requestLink(req, body["slug"], body["identity"]));
            case "verify":
              return h.json(await p.verifyLink(req, body["slug"], body["token"]));
            case "tickets":
              return h.json(await p.listTickets(await p.requireSession(req)));
            case "ticket":
              return h.json(await p.getTicket(await p.requireSession(req), body["ticketId"]));
            case "create":
              return h.json(
                await p.createTicket(
                  await p.requireSession(req),
                  body["subject"],
                  body["description"],
                ),
              );
            case "comment":
              return h.json(
                await p.addComment(await p.requireSession(req), body["ticketId"], body["body"]),
              );
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
