import { describe, expect, it } from "vitest";

import {
  channelFromPlatform,
  clip,
  conversationTranscript,
  evaluationPrompt,
  whoHandled,
  type TranscriptMessage,
} from "./transcript";

const base = { sender_user_id: null, type: "text", is_private: false } as const;
const msgs: TranscriptMessage[] = [
  {
    ...base,
    direction: "out",
    sender_type: "user",
    sender_user_id: "u1",
    body: "Oi, sou a Ana",
    created_at: "2026-10-26T10:01:00Z",
  },
  {
    ...base,
    direction: "in",
    sender_type: "contact",
    body: "Meu CPF é 529.982.247-25",
    created_at: "2026-10-26T10:00:00Z",
  },
  {
    ...base,
    direction: "out",
    sender_type: "user",
    sender_user_id: "u1",
    body: "nota",
    type: "note",
    is_private: true,
    created_at: "2026-10-26T10:02:00Z",
  },
  {
    ...base,
    direction: "in",
    sender_type: "contact",
    body: null,
    transcript: "quero cancelar",
    type: "audio",
    created_at: "2026-10-26T10:03:00Z",
  },
  {
    ...base,
    direction: "out",
    sender_type: "ai",
    body: "Posso ajudar",
    created_at: "2026-10-26T10:04:00Z",
  },
];

describe("conversationTranscript", () => {
  it("ordena, rotula quem falou, usa transcrição do áudio, pula nota e mascara CPF", () => {
    const t = conversationTranscript(msgs, new Map([["u1", "Ana"]]));
    expect(t.split("\n")).toEqual([
      "Cliente: Meu CPF é [CPF oculto]",
      "Atendente (Ana): Oi, sou a Ana",
      "Cliente: quero cancelar",
      "Agente de IA: Posso ajudar",
    ]);
  });
});

describe("whoHandled", () => {
  it("escolhe o humano que mais respondeu", () => {
    expect(whoHandled(msgs, null)).toEqual({ agentUserId: "u1", isAi: false });
  });
  it("só IA respondeu", () => {
    expect(
      whoHandled(
        msgs.filter((m) => m.sender_type !== "user"),
        "dono",
      ),
    ).toEqual({
      agentUserId: null,
      isAi: true,
    });
  });
  it("sem resposta pública cai no responsável da conversa", () => {
    expect(whoHandled([], "dono")).toEqual({ agentUserId: "dono", isAi: false });
  });
});

describe("clip e canal", () => {
  it("corta o meio e guarda começo e fim", () => {
    const s = "a".repeat(60) + "b".repeat(60);
    const r = clip(s, 100);
    expect(r.startsWith("a".repeat(60))).toBe(true);
    expect(r.endsWith("b".repeat(40))).toBe(true);
    expect(r).toContain("omitido");
  });
  it("e-mail vira canal e-mail; o resto é chat", () => {
    expect(channelFromPlatform("email")).toBe("email");
    expect(channelFromPlatform("whatsapp")).toBe("chat");
    expect(channelFromPlatform(null)).toBe("chat");
  });
  it("o pedido lista os critérios com id e marca o eliminatório", () => {
    const p = evaluationPrompt({
      criteria: [{ id: "x", label: "Não prometeu", description: "", weight: 1, eliminatory: true }],
      channel: "call",
      isAi: true,
      formName: "SAC",
      company: "Loja",
    });
    expect(p).toContain('id "x"');
    expect(p).toContain("ELIMINATÓRIO");
    expect(p).toContain("agente de IA");
  });
});
