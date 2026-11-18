import { createFileRoute } from "@tanstack/react-router";

// Webhook de início de conversa da ElevenLabs: devolve as variáveis dinâmicas com o contexto do CRM.
export const Route = createFileRoute("/api/public/voice/init")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) =>
          (await import("@/backend/telephony/voice-public.server")).handleInit(req),
        )(ctx);
      },
    },
  },
});
