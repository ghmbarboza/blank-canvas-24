import { createFileRoute } from "@tanstack/react-router";

// LLM da voz (ElevenLabs "Custom LLM"): POST no formato Chat Completions da OpenAI, resposta em
// SSE. ?a=<conta>[&ensaio=1], Authorization: Bearer <voice_llm_token da conta>.
export const Route = createFileRoute("/api/voz/llm")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const { voiceLlm } = await import("@/backend/telephony/voice-llm.server");
          return voiceLlm(req);
        })(ctx);
      },
    },
  },
});
