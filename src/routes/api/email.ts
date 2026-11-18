import { createFileRoute } from "@tanstack/react-router";

type Body = {
  accountId?: string;
  action?: string;
  to?: string;
  subject?: string;
  text?: string;
  contactId?: string;
  dealId?: string;
  conversationId?: string;
  campaignId?: string;
  scheduledAt?: string | null;
  domain?: string;
  inviteId?: string;
  segmentId?: string | null;
  filter?: unknown;
  brief?: string;
  tone?: string;
  link?: string;
};

// Ações de e-mail do app: 1:1, resposta da inbox, campanha (teste, disparo, pausa), DNS, convite.
export const Route = createFileRoute("/api/email")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Body>(req);
          const actions = await import("@/backend/email/actions.server");
          const { requireModule } = await import("@/backend/modules.server");
          // Campanhas de e-mail só com o recurso ligado (S3).
          const campaign = async (allowed: "member" | "manager") => {
            const caller = await h.requireMember(req, body.accountId, allowed);
            await requireModule(caller, "campanhas");
            return caller;
          };
          switch (body.action) {
            case "send":
              return h.json(
                await actions.sendOne(await h.requireMember(req, body.accountId), body),
              );
            case "reply":
              return h.json(
                await actions.replyConversation(await h.requireMember(req, body.accountId), body),
              );
            case "audience":
              return h.json(await actions.audience(await campaign("manager"), body));
            case "campaign_test":
              return h.json(await actions.campaignTest(await campaign("manager"), body));
            case "campaign_start":
              return h.json(await actions.campaignStart(await campaign("manager"), body));
            case "campaign_pause":
            case "campaign_resume":
            case "campaign_cancel":
              return h.json(
                await actions.campaignControl(
                  await campaign("manager"),
                  body.campaignId,
                  body.action,
                ),
              );
            case "compose": {
              const caller = await h.requireMember(req, body.accountId, "manager");
              await h.rateLimit(`ai:compose:${caller.userId}`, 30, 3600);
              return h.json(await actions.composeCampaign(caller, body));
            }
            case "domain_check":
              return h.json(
                await actions.domainCheck(
                  await h.requireMember(req, body.accountId, "manager"),
                  body.domain,
                ),
              );
            case "invite":
              return h.json(
                await actions.sendInvite(
                  await h.requireMember(req, body.accountId, "manager"),
                  body.inviteId,
                ),
              );
            case "setup_info":
              return h.json(
                await actions.setupInfo(await h.requireMember(req, body.accountId, "admin")),
              );
            case "health":
              return h.json(
                await actions.health(await h.requireMember(req, body.accountId, "manager")),
              );
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
