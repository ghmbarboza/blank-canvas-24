import { createFileRoute } from "@tanstack/react-router";

// Ações de telefonia do usuário logado. action:
//   webrtc_key | callback | balance | deepgram_token | recording | coach | create_extension
export const Route = createFileRoute("/api/telephony")({
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
          const a = await import("@/backend/telephony/actions.server");
          switch (body.action) {
            case "webrtc_key":
              return h.json(await a.webrtcKey(await h.requireMember(req, body.accountId)));
            case "callback":
              return h.json(await a.clickToCall(await h.requireMember(req, body.accountId), body));
            case "balance":
              return h.json(await a.balance(await h.requireMember(req, body.accountId, "manager")));
            case "deepgram_token":
              return h.json(await a.deepgramToken(await h.requireMember(req, body.accountId)));
            case "recording":
              return h.json(
                await a.recordingUrl(await h.requireMember(req, body.accountId), body["callId"]),
              );
            case "coach": {
              const caller = await h.requireMember(req, body.accountId);
              // R9: dica do coach chama a IA a cada trecho da ligação
              await h.rateLimit(`ai:coach:${caller.userId}`, 120, 600);
              return h.json(await a.coachTips(caller, body));
            }
            case "create_extension":
              return h.json(
                await a.createExtension(
                  await h.requireMember(req, body.accountId, "manager"),
                  body,
                ),
              );
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
