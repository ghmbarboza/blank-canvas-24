import { createFileRoute } from "@tanstack/react-router";

// Webhook pós-chamada da ElevenLabs (assinado com HMAC): transcrição, avaliação e dados coletados.
export const Route = createFileRoute("/api/public/voice/postcall")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) =>
          (await import("@/backend/telephony/voice-public.server")).handlePostCall(req),
        )(ctx);
      },
    },
  },
});
