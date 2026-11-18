import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/http.server", () => ({
  admin: () => ({}),
  HttpError: Error,
  isUuid: () => true,
  safeEqual: () => true,
}));

const { chunk, voiceHistory } = await import("./voice-llm.server");

describe("voz → histórico do Vínculo", () => {
  it("ignora o sistema da ElevenLabs, junta partes e corta vazio", () => {
    const h = voiceHistory([
      { role: "system", content: "prompt da EL" },
      { role: "assistant", content: "Oi, aqui é a Ana." },
      {
        role: "user",
        content: [
          { type: "text", text: "Quero" },
          { type: "text", text: "remarcar" },
        ],
      },
      { role: "user", content: "   " },
    ]);
    expect(h).toEqual([
      { role: "assistant", content: "Oi, aqui é a Ana." },
      { role: "user", content: "Quero remarcar" },
    ]);
  });
});

describe("chunk no formato da OpenAI", () => {
  it("texto vira delta.content; o fim leva finish_reason", () => {
    const a = JSON.parse(chunk("x", "Olá").slice(6));
    expect(a.object).toBe("chat.completion.chunk");
    expect(a.choices[0].delta).toEqual({ role: "assistant", content: "Olá" });
    const b = JSON.parse(chunk("x", null, "stop").slice(6));
    expect(b.choices[0]).toMatchObject({ delta: {}, finish_reason: "stop" });
  });
});

describe("endereço que a ElevenLabs chama", () => {
  it("conta e ensaio vêm do caminho, com o /chat/completions que ela acrescenta", async () => {
    const { voiceTarget } = await import("./voice-llm.server");
    expect(
      voiceTarget("/api/voz/e41e66c9-f743-4ca3-af0c-7fd80775468b/ensaio/chat/completions"),
    ).toEqual({
      accountId: "e41e66c9-f743-4ca3-af0c-7fd80775468b",
      rehearsal: true,
      outbound: false,
    });
    expect(voiceTarget("/api/voz/abc/chat/completions")).toEqual({
      accountId: "abc",
      rehearsal: false,
      outbound: false,
    });
    expect(voiceTarget("/api/voz/abc/ensaio/saida/chat/completions")).toEqual({
      accountId: "abc",
      rehearsal: true,
      outbound: true,
    });
  });
});

describe("desligar a ligação", () => {
  it("vira chamada de ferramenta end_call no formato que a ElevenLabs lê", async () => {
    const { endCallChunk } = await import("./voice-llm.server");
    const line = endCallChunk("chatcmpl-abc123456789xyz");
    const data = JSON.parse(line.replace(/^data: /, "").trim());
    const call = data.choices[0].delta.tool_calls[0];
    expect(call.type).toBe("function");
    expect(call.function.name).toBe("end_call");
    expect(JSON.parse(call.function.arguments)).toHaveProperty("reason");
  });
});

describe("histórico da voz", () => {
  it("tira a frase de espera do começo das falas da IA (o modelo copiava 'Hum... Hum...')", async () => {
    const { voiceHistory } = await import("./voice-llm.server");
    const h = voiceHistory([
      { role: "assistant", content: "Hum... Hum... Só um segundinho... Temos dois clareamentos." },
      { role: "user", content: "Hum, e o preço?" },
    ]);
    expect(h[0]).toEqual({ role: "assistant", content: "Temos dois clareamentos." });
    expect(h[1]).toEqual({ role: "user", content: "Hum, e o preço?" });
  });
});
