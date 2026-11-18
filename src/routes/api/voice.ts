import { createFileRoute } from "@tanstack/react-router";

// Voz com IA (gestores). action:
//   publish_agent | register_number | test_agent | enroll_campaign | campaign_status
//   call_contact (ligar agora para um contato) | link_number (número já na ElevenLabs)
export const Route = createFileRoute("/api/voice")({
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
          const v = await import("@/backend/telephony/voice-admin.server");
          switch (body.action) {
            case "publish_agent":
              return h.json(
                await v.publishAgent(
                  req,
                  await h.requireMember(req, body.accountId, "manager"),
                  body["agentId"],
                ),
              );
            case "register_number":
              return h.json(
                await v.registerNumber(
                  await h.requireMember(req, body.accountId, "admin"),
                  body["phoneId"],
                  body["sipPassword"],
                ),
              );
            case "test_agent": {
              const caller = await h.requireMember(req, body.accountId, "manager");
              await h.rateLimit(`ai:voice-test:${caller.userId}`, 20, 600);
              return h.json(await v.testAgent(caller, body));
            }
            case "voices":
              return h.json(
                await v.listVoices(await h.requireMember(req, body.accountId, "manager")),
              );
            case "enroll_campaign":
              return h.json(
                await v.enrollCampaign(
                  await h.requireMember(req, body.accountId, "manager"),
                  body["campaignId"],
                ),
              );
            case "campaign_status":
              return h.json(
                await v.setCampaignStatus(
                  await h.requireMember(req, body.accountId, "manager"),
                  body["campaignId"],
                  body["status"],
                ),
              );
            case "call_contact":
              return h.json(
                await v.callContact(await h.requireMember(req, body.accountId, "manager"), body),
              );
            case "link_number":
              return h.json(
                await v.linkNumber(await h.requireMember(req, body.accountId, "admin"), body),
              );
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
