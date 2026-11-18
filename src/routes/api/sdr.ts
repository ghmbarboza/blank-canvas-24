import { createFileRoute } from "@tanstack/react-router";

// SDR: treinar a pontuação preditiva agora e simular o roteamento de um lead.
export const Route = createFileRoute("/api/sdr")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Record<string, unknown>>(req);
          const caller = await h.requireMember(req, body["accountId"], "manager");
          const s = await import("@/backend/sdr/sdr.server");
          const str = (k: string) => {
            const v = String(body[k] ?? "")
              .trim()
              .slice(0, 120);
            return v || null;
          };
          switch (body["action"]) {
            case "train": {
              await h.rateLimit(`sdr:train:${caller.accountId}`, 6, 3600);
              return h.json(await s.trainAndScore(caller.accountId));
            }
            case "simulate":
              return h.json(
                await s.simulateRoute(caller.accountId, {
                  state: str("state")?.toUpperCase() ?? null,
                  city: str("city"),
                  segment: str("segment"),
                  source: str("source"),
                  size: str("size"),
                }),
              );
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
