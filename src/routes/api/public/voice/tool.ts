import { createFileRoute } from "@tanstack/react-router";

// Ferramentas do agente de voz (crm_lookup, slots, book, create_ticket, update_deal, send_whatsapp).
export const Route = createFileRoute("/api/public/voice/tool")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) =>
          (await import("@/backend/telephony/voice-public.server")).handleTool(req),
        )(ctx);
      },
    },
  },
});
