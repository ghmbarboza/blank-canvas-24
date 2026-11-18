import { createFileRoute } from "@tanstack/react-router";

// Chat do site, lado do visitante: configuração (GET), iniciar, enviar e buscar novas mensagens (POST).
export const Route = createFileRoute("/api/public/webchat")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        const wc = await import("@/backend/webchat.server");
        return h.handle(async (req) => {
          const id = new URL(req.url).searchParams.get("channel");
          if (!h.isUuid(id)) throw new h.HttpError(400, "Chat inválido", "bad_channel");
          const ch = await wc.webchatChannel(id);
          const cfg = (ch.config ?? {}) as Record<string, unknown>;
          return h.json(
            {
              name: ch.name,
              greeting:
                typeof cfg["greeting"] === "string" ? cfg["greeting"] : "Oi! Como podemos ajudar?",
              color:
                typeof cfg["color"] === "string" && /^#[0-9a-f]{6}$/i.test(cfg["color"] as string)
                  ? cfg["color"]
                  : "#001F35",
              ask_email: cfg["ask_email"] !== false,
              account_id: ch.account_id,
            },
            200,
            { "cache-control": "public, max-age=120" },
          );
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const wc = await import("@/backend/webchat.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            action?: string;
            channelId?: string;
            token?: string;
            text?: string;
            after?: string;
            name?: string;
            email?: string;
            phone?: string;
            visitorId?: string;
            pageUrl?: string;
          }>(req, 4 * 1024);
          if (body.action === "start") {
            if (!h.isUuid(body.channelId))
              throw new h.HttpError(400, "Chat inválido", "bad_channel");
            const ip = h.trustedIp(req);
            await h.rateLimit(`webchat:start:${body.channelId}:${ip}`, 5, 3600);
            await h.rateLimit(`webchat:start:${body.channelId}`, 300, 3600);
            const r = await wc.startSession(body.channelId, {
              ...(body.name ? { name: body.name } : {}),
              ...(body.email ? { email: body.email } : {}),
              ...(body.phone ? { phone: body.phone } : {}),
              visitorId:
                typeof body.visitorId === "string" && /^[a-z0-9-]{8,64}$/i.test(body.visitorId)
                  ? body.visitorId
                  : null,
              pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : null,
            });
            return h.json({ token: r.token });
          }
          if (body.action === "send") {
            await h.rateLimit(
              `webchat:send:${h.trustedIp(req)}`,
              60,
              600,
              "Calma! Muitas mensagens seguidas.",
            );
            // Cada mensagem do visitante pode acionar a IA: teto por sessão além do teto por IP.
            if (typeof body.token === "string")
              await h.rateLimit(
                `webchat:send:sess:${wc.hashToken(body.token).slice(0, 32)}`,
                10,
                60,
                "Calma! Muitas mensagens seguidas.",
              );
            return h.json({ message: await wc.visitorSend(body.token, body.text) });
          }
          if (body.action === "poll")
            return h.json({
              messages: await wc.visitorPoll(body.token, body.after),
              typing: await wc.visitorTyping(body.token),
            });
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
