import { createFileRoute } from "@tanstack/react-router";

// Zernio da conta (WhatsApp, número real e voz). Corpo: { accountId, action, ...params }.
// Configuração só para admin; enviar, ligar e pedir permissão para qualquer membro.
type Body = Record<string, unknown> & { accountId?: string; action?: string };

export const Route = createFileRoute("/api/zernio")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<Body>(req);
          const action = String(body.action ?? "");
          const { zernioRole } = await import("@/backend/providers/zernio-roles");
          const role = zernioRole(action);
          const caller = await h.requireMember(req, body.accountId, role);
          const acc = caller.accountId;
          await h.rateLimit(`zernio:api:${caller.userId}`, 240, 600);
          const s = await import("@/backend/providers/zernio-actions.server");
          const v = await import("@/backend/providers/zernio-voice-actions.server");
          const p = body as never;
          switch (action) {
            case "key.save":
              await h.rateLimit(`zernio:key:${acc}`, 10, 3600);
              return h.json(
                await s.saveKey(
                  req,
                  acc,
                  typeof body["apiKey"] === "string" ? body["apiKey"] : undefined,
                ),
              );
            case "key.test":
              return h.json(await s.testKey(acc));
            case "whatsapp.connect_url":
              return h.json(await s.whatsappConnect(req, acc, p));
            case "whatsapp.connected":
              return h.json(
                await s.syncAccounts(acc, {
                  ...(typeof body["zernioAccountId"] === "string"
                    ? { zernioAccountId: body["zernioAccountId"] }
                    : {}),
                  coexistence: body["coexistence"] === true,
                }),
              );
            case "social.connect_url":
              return h.json(await s.socialConnect(req, acc, p));
            case "sync":
              return h.json(await s.syncAccounts(acc));
            case "hub":
              return h.json(await s.hub(acc));
            case "hub.connect":
              return h.json(await s.connectOption(req, acc, p));
            case "social_auto.list":
            case "social_auto.create":
            case "social_auto.toggle":
            case "social_auto.remove":
            case "social_auto.draft": {
              const c = await import("@/backend/providers/zernio-comments.server");
              if (action === "social_auto.list") return h.json(await c.listSocialAutomations(acc));
              if (action === "social_auto.create") {
                await h.rateLimit(`zernio:social:${acc}`, 30, 3600);
                return h.json(await c.createSocialAutomation(acc, p));
              }
              if (action === "social_auto.toggle")
                return h.json(await c.toggleSocialAutomation(acc, p));
              if (action === "social_auto.remove")
                return h.json(await c.removeSocialAutomation(acc, p));
              await h.rateLimit(`ai:social:${caller.userId}`, 30, 3600);
              return h.json(await c.draftSocialAutomation(acc, p));
            }
            case "numbers.catalog":
              return h.json(await s.numberCatalog(acc, String(body["country"] ?? "BR")));
            case "numbers.list":
              return h.json(await s.syncNumbers(acc));
            case "numbers.kyc_link":
              return h.json(await s.kycLink(req, acc, p));
            case "numbers.purchase":
              await h.rateLimit(`zernio:buy:${acc}`, 3, 3600);
              return h.json(await s.purchase(acc, p));
            case "port.check":
              await h.rateLimit(`zernio:port:${acc}`, 20, 3600);
              return h.json(
                await s.portabilityCheck(
                  acc,
                  typeof body["phone"] === "string" ? body["phone"] : undefined,
                ),
              );
            case "voice.save":
              return h.json(await v.saveVoice(acc, p));
            case "calling.get":
              return h.json(await v.getCalling(acc, body["channelId"]));
            case "calling.save":
              return h.json(await v.saveCalling(acc, p));
            case "permission.request":
              return h.json(await v.askPermission(acc, caller.userId, p));
            case "call.whatsapp":
              return h.json(await v.callOnWhatsApp(acc, caller.userId, p));
            case "web.session":
              return h.json(await v.webCallSession(acc, caller.userId));
            case "web.dial":
              return h.json(await v.webCallDial(acc, caller.userId, p));
            case "call.end":
              return h.json(
                await v.hangUp(acc, body["zernioCallId"], {
                  userId: caller.userId,
                  isManager: ["owner", "admin", "manager"].includes(caller.role),
                  callToken: body["callToken"],
                }),
              );
            case "call.transfer":
              return h.json(await v.transfer(acc, p));
            case "health":
              return h.json({
                numbers: await v.numberHealth(acc, Number(body["hours"] ?? 24) || 24),
              });
            case "message.send": {
              const { sendFromInbox } =
                await import("@/backend/providers/zernio-inbox-send.server");
              return h.json(await sendFromInbox(caller, p));
            }
            default:
              throw new h.HttpError(400, "Ação inválida", "bad_action");
          }
        })(ctx);
      },
    },
  },
});
