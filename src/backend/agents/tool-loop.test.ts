import { describe, expect, it } from "vitest";

import {
  anthropicMessages,
  anthropicToolsBody,
  chatMessages,
  chatToolsBody,
  parseAnthropicTools,
  parseChatTools,
  resultText,
  sanitizeSchema,
  type Turn,
} from "./tool-loop";

const tools = [
  {
    name: "kb_search",
    description: "Busca na base",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];

const turns: Turn[] = [
  { role: "assistant", content: "Olá, sou a assistente." },
  {
    role: "user",
    content: "Segue o comprovante",
    attachments: [
      { kind: "image", url: "https://x/img.jpg" },
      { kind: "pdf", url: "https://x/a.pdf", name: "boleto.pdf" },
    ],
  },
  {
    role: "assistant_tools",
    text: "",
    calls: [{ id: "t1", name: "kb_search", args: { query: "x" } }],
  },
  {
    role: "tool_results",
    results: [{ id: "t1", name: "kb_search", content: "[]", isError: false }],
  },
];

describe("Anthropic", () => {
  it("abre com mensagem do cliente, junta papéis e manda anexos", () => {
    const msgs = anthropicMessages(turns);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    const withFiles = msgs[2]!.content;
    expect(withFiles[0]).toMatchObject({ type: "image", source: { url: "https://x/img.jpg" } });
    expect(withFiles[1]).toMatchObject({ type: "document" });
    expect(msgs[4]!.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });
  it("obriga a usar ferramenta", () => {
    const b = anthropicToolsBody("claude-haiku-5-5", "sys", turns, tools);
    expect(b.tool_choice).toEqual({ type: "any" });
    expect(b.tools[0]).toMatchObject({ name: "kb_search", input_schema: tools[0]!.parameters });
  });
  it("lê as chamadas pedidas", () => {
    const p = parseAnthropicTools({
      content: [
        { type: "text", text: "vou ver" },
        { type: "tool_use", id: "x1", name: "respond", input: { reply: "oi" } },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    expect(p.calls).toEqual([{ id: "x1", name: "respond", args: { reply: "oi" } }]);
    expect(p.text).toBe("vou ver");
    expect(p.inputTokens).toBe(10);
  });
});

describe("Chat (OpenAI / gateway)", () => {
  it("monta imagem como image_url e PDF como aviso no texto", () => {
    const msgs = chatMessages("sys", turns);
    const user = msgs[2] as { content: { type: string; text?: string }[] };
    expect(user.content[0]?.text).toContain("boleto.pdf");
    expect(user.content[1]).toMatchObject({ type: "image_url" });
    expect(msgs[3]).toMatchObject({ role: "assistant", tool_calls: [{ id: "t1" }] });
    expect(msgs[4]).toMatchObject({ role: "tool", tool_call_id: "t1" });
  });
  it("usa max_completion_tokens só na OpenAI", () => {
    expect(chatToolsBody("openai", "m", "s", turns, tools)).toHaveProperty("max_completion_tokens");
    expect(chatToolsBody("lovable", "m", "s", turns, tools)).toHaveProperty("max_tokens");
    expect(chatToolsBody("openai", "m", "s", turns, tools).tool_choice).toBe("required");
  });
  it("lê argumentos em texto e tolera JSON quebrado", () => {
    const p = parseChatTools({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "a", function: { name: "respond", arguments: '{"reply":"oi"}' } },
              { id: "b", function: { name: "kb_search", arguments: "{quebrado" } },
            ],
          },
        },
      ],
    });
    expect(p.calls[0]?.args).toEqual({ reply: "oi" });
    expect(p.calls[1]?.args).toHaveProperty("_invalid_json");
  });
});

describe("sanitizeSchema", () => {
  it("tira exemplos e títulos e corta descrição longa", () => {
    const s = sanitizeSchema({
      type: "object",
      title: "X",
      properties: {
        to: { type: "string", title: "To", examples: ["a@b"], description: "d".repeat(900) },
        list: { type: "array", items: { type: "string", examples: ["x"] } },
      },
    });
    const to = (s["properties"] as Record<string, Record<string, unknown>>)["to"]!;
    expect(to["examples"]).toBeUndefined();
    expect(String(to["description"]).length).toBe(400);
    expect(s["title"]).toBeUndefined();
  });
  it("esquema ausente vira objeto vazio", () => {
    expect(sanitizeSchema(null)).toEqual({ type: "object", properties: {} });
  });
});

it("resultText corta resultado enorme", () => {
  expect(resultText("x".repeat(5000)).length).toBeLessThan(4100);
});
