import { createFileRoute } from "@tanstack/react-router";

// Templates aprovados do WhatsApp oficial (Meta direta ou Zernio) de um canal, para responder fora da janela de 24 h.
export const Route = createFileRoute("/api/whatsapp/templates")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{ accountId?: string; channelId?: string }>(req);
          const caller = await h.requireMember(req, body.accountId, "member");
          if (!h.isUuid(body.channelId))
            throw new h.HttpError(400, "Canal inválido", "bad_channel");
          const { listMetaTemplates } = await import("@/backend/support/channel-send.server");
          const { listChannelTemplates } =
            await import("@/backend/providers/zernio-actions.server");
          try {
            const zernioList = await listChannelTemplates(caller.accountId, body.channelId);
            const list = zernioList ?? (await listMetaTemplates(caller.accountId, body.channelId));
            const { templateShape } = await import("@/features/inbox/template-shape");
            return h.json({
              templates: list.map((t) => {
                const shape = templateShape(t.components);
                return {
                  name: t.name,
                  language: t.language,
                  category: t.category,
                  header: shape.header,
                  body: shape.body,
                  slots: shape.slots,
                  variables: shape.slots.length,
                  unsupported: shape.unsupported,
                };
              }),
            });
          } catch (err) {
            throw new h.HttpError(
              502,
              err instanceof Error ? err.message : "Não deu para buscar os templates",
              "provider",
            );
          }
        })(ctx);
      },
    },
  },
});
