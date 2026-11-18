import { createFileRoute } from "@tanstack/react-router";

// LLM da voz pela ElevenLabs: ela acrescenta /chat/completions ao endereço base configurado.
// POST /api/voz/<conta>[/ensaio]/chat/completions · Authorization: Bearer <voice_llm_token>.
// Modelo dentro da ElevenLabs: GET /api/voz/<conta>/prompt e POST …/ferramenta/<nome>.
export const Route = createFileRoute("/api/voz/$")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      // GET /api/voz/<conta>/aquecer: carrega motor e equipe antes de discar
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          // /prompt: o prompt de voz para o agente que roda o modelo dentro da ElevenLabs
          if (new URL(req.url).pathname.endsWith("/prompt")) {
            const { voicePrompt } = await import("@/backend/telephony/voice-native.server");
            return voicePrompt(req);
          }
          const { voiceWarm } = await import("@/backend/telephony/voice-llm.server");
          return voiceWarm(req);
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          // /ferramenta/<nome>: webhook das ferramentas do agente nativo
          if (new URL(req.url).pathname.includes("/ferramenta/")) {
            const { voiceTool } = await import("@/backend/telephony/voice-native.server");
            return voiceTool(req);
          }
          const { voiceLlm } = await import("@/backend/telephony/voice-llm.server");
          return voiceLlm(req);
        })(ctx);
      },
    },
  },
});
