import { createFileRoute } from "@tanstack/react-router";

// Chat do site, lado da equipe: responder pela inbox e criar/configurar o canal do chat.
export const Route = createFileRoute("/api/webchat")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            conversationId?: string;
            text?: string;
            name?: string;
            greeting?: string;
            color?: string;
            ai?: boolean;
            ask_email?: boolean;
            channelId?: string;
          }>(req);
          const db = h.admin();

          if (body.action === "save_channel") {
            const caller = await h.requireMember(req, body.accountId, "admin");
            const config = {
              greeting: String(body.greeting ?? "Oi! Como podemos ajudar?").slice(0, 300),
              color: /^#[0-9a-f]{6}$/i.test(String(body.color ?? "")) ? body.color : "#001F35",
              ai: body.ai !== false,
              ask_email: body.ask_email !== false,
            };
            const name =
              String(body.name ?? "Chat do site")
                .trim()
                .slice(0, 80) || "Chat do site";
            if (h.isUuid(body.channelId)) {
              const { error } = await db
                .from("channels")
                .update({ name, config, ai_enabled: config.ai })
                .eq("id", body.channelId)
                .eq("account_id", caller.accountId)
                .eq("provider", "webchat");
              if (error) throw new h.HttpError(500, error.message, "save");
              return h.json({ id: body.channelId });
            }
            const { data, error } = await db
              .from("channels")
              .insert({
                account_id: caller.accountId,
                provider: "webchat",
                platform: "webchat",
                name,
                external_id: `webchat-${caller.accountId}-${Date.now()}`,
                status: "connected",
                config,
                ai_enabled: config.ai,
                is_shared: true,
              })
              .select("id")
              .single();
            if (error) throw new h.HttpError(500, error.message, "save");
            return h.json({ id: data.id });
          }

          // Resposta da equipe numa conversa do chat do site (padrão: action ausente).
          const caller = await h.requireMember(req, body.accountId, "member");
          if (!h.isUuid(body.conversationId))
            throw new h.HttpError(400, "Conversa inválida", "bad_conversation");
          const text = String(body.text ?? "").trim();
          if (!text) throw new h.HttpError(400, "Mensagem vazia", "empty");
          if (text.length > 4000) throw new h.HttpError(400, "Mensagem longa demais", "too_long");
          const { data: conv } = await db
            .from("conversations")
            .select(
              "id, account_id, assignee_user_id, channels!inner(provider, owner_user_id, is_shared)",
            )
            .eq("id", body.conversationId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!conv) throw new h.HttpError(404, "Conversa não encontrada", "not_found");
          const ch = conv.channels as unknown as {
            provider: string;
            owner_user_id: string | null;
            is_shared: boolean;
          };
          if (ch.provider !== "webchat")
            throw new h.HttpError(409, "Esta conversa não é do chat do site", "not_webchat");
          const isMgr = ["owner", "admin", "manager"].includes(caller.role);
          if (
            !isMgr &&
            !ch.is_shared &&
            ch.owner_user_id !== caller.userId &&
            conv.assignee_user_id !== caller.userId
          )
            throw new h.HttpError(403, "Canal de outro vendedor", "forbidden");
          const { sendWebchatReply } = await import("@/backend/messaging.server");
          const msg = await sendWebchatReply(
            caller.accountId,
            conv.id,
            text,
            "user",
            caller.userId,
          );
          if (!conv.assignee_user_id)
            await db
              .from("conversations")
              .update({ assignee_user_id: caller.userId })
              .eq("id", conv.id);
          return h.json({ ok: true, messageId: msg.id });
        })(ctx);
      },
    },
  },
});
