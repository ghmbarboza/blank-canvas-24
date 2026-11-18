import { describe, expect, it } from "vitest";

import {
  anthropicBody,
  chatBody,
  estimateCost,
  parseAnthropic,
  parseChat,
  strictSchema,
  supportsForcedTool,
} from "./llm-core";

const req = {
  system: "sys",
  messages: [{ role: "user" as const, content: "oi" }],
  schemaName: "reply",
  schema: { type: "object" },
};

describe("camada pura do LLM", () => {
  it("força a ferramenta no Anthropic e no formato chat", () => {
    expect(anthropicBody("m", req)).toMatchObject({ tool_choice: { type: "tool", name: "reply" } });
    const c = chatBody("openai", "m", req);
    expect(c.tool_choice).toEqual({ type: "function", function: { name: "reply" } });
    expect(c.messages[0]).toEqual({ role: "system", content: "sys" });
    expect("max_completion_tokens" in c).toBe(true);
  });
  it("lê o JSON da ferramenta e os tokens", () => {
    const a = parseAnthropic<{ x: number }>({
      content: [{ type: "text" }, { type: "tool_use", input: { x: 1 } }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    expect(a).toEqual({ data: { x: 1 }, inputTokens: 10, outputTokens: 2 });
    const o = parseChat<{ y: string }>({
      choices: [{ message: { tool_calls: [{ function: { arguments: '{"y":"ok"}' } }] } }],
    });
    expect(o.data.y).toBe("ok");
  });
  it("falha alto quando o modelo não usa a ferramenta", () => {
    expect(() => parseAnthropic({ content: [{ type: "text" }] })).toThrow();
    expect(() => parseChat({ choices: [{ message: {} }] })).toThrow();
  });
  it("estima custo pelo modelo", () => {
    expect(estimateCost("claude-haiku-5-5", 1_000_000, 0)).toBeCloseTo(1);
  });
  it("Opus 5.5 não aceita ferramenta forçada: o JSON vem pela saída estruturada", () => {
    expect(supportsForcedTool("anthropic/claude-opus-5-5")).toBe(false);
    expect(supportsForcedTool("claude-sonnet-5-5")).toBe(false);
    expect(supportsForcedTool("anthropic/claude-haiku-4-5")).toBe(true);
    const b = anthropicBody("anthropic/claude-opus-5-5", req) as Record<string, unknown>;
    expect(b["tool_choice"]).toBeUndefined();
    expect(b["thinking"]).toBeUndefined();
    expect(b["output_config"]).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    const d = parseAnthropic<{ ok: boolean }>({
      content: [{ type: "thinking" }, { type: "text", text: '```json\n{"ok":true}\n```' }],
    });
    expect(d.data.ok).toBe(true);
  });
  it("fecha o esquema em todo objeto aninhado", () => {
    const s = strictSchema({
      type: "object",
      properties: { a: { type: "object", properties: { b: { type: "string" } } } },
    }) as { additionalProperties: boolean; properties: { a: { additionalProperties: boolean } } };
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.a.additionalProperties).toBe(false);
  });
});
