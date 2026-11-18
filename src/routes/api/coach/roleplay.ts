import { createFileRoute } from "@tanstack/react-router";

// Treino com roleplay: seed de personas (gestor), iniciar, responder e encerrar (vendedor).
export const Route = createFileRoute("/api/coach/roleplay")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            personaId?: string;
            playbookId?: string | null;
            sessionId?: string;
            text?: string;
          }>(req);
          const r = await import("@/backend/training/roleplay.server");
          const { requireModule } = await import("@/backend/modules.server");
          // Treino só com o recurso ligado (S3); cada fala gasta IA, então tem teto por pessoa.
          const member = async (allowed: "member" | "manager" = "member") => {
            const caller = await h.requireMember(req, body.accountId, allowed);
            await requireModule(caller, "treino");
            if (body.action !== "seed")
              await h.rateLimit(
                `roleplay:${caller.userId}`,
                120,
                3600,
                "Muitas falas no treino em pouco tempo. Espere uns minutos.",
              );
            return caller;
          };
          switch (body.action) {
            case "seed":
              return h.json(await r.seedPersonas(await member("manager")));
            case "start":
              return h.json(await r.start(await member(), body.personaId, body.playbookId));
            case "reply":
              return h.json(await r.reply(await member(), body.sessionId, body.text));
            case "finish":
              return h.json(await r.finish(await member(), body.sessionId));
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
