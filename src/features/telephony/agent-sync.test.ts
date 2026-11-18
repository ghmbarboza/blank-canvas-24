import { describe, expect, it } from "vitest";

import { buildAgentBody, diffAgent } from "./agent-sync";

const input = {
  name: "Ana",
  prompt: "Você é {{agent_name}}",
  firstMessage: "Oi",
  voiceId: "v1",
  modelId: "eleven_v4_turbo",
  language: "pt",
  knowledge: "Horário: 9h às 18h",
  tools: ["crm_lookup", "book", "inexistente"],
  transferNumber: null,
  baseUrl: "https://app.test",
  accountId: "acc",
  agentRowId: "ag",
  toolSecret: "s3",
  companyName: "Acme",
  agentName: "Ana",
};

describe("agente da ElevenLabs", () => {
  it("monta tools com segredo e URL por conta, ignora tool desconhecida", () => {
    const b = buildAgentBody(input);
    const tools = b.conversation_config.agent.prompt.tools.filter((t) => t.type === "webhook") as {
      name: string;
      api_schema: { url: string; request_headers: Record<string, string> };
    }[];
    expect(tools.map((t) => t.name)).toEqual(["crm_lookup", "book"]);
    expect(tools[0]!.api_schema.url).toBe(
      "https://app.test/api/public/voice/tool?a=acc&t=crm_lookup",
    );
    expect(tools[0]!.api_schema.request_headers["x-nexus-tool-secret"]).toBe("s3");
    expect(b.conversation_config.agent.prompt.prompt).toContain("Horário: 9h às 18h");
    expect(b.conversation_config.agent.prompt.max_tokens).toBeGreaterThanOrEqual(400);
  });
  it("leitura de volta igual não gera diferença", () => {
    const b = buildAgentBody(input);
    expect(diffAgent(b, JSON.parse(JSON.stringify(b)))).toEqual([]);
  });
  it("aponta o que a ElevenLabs aceitou e ignorou", () => {
    const b = buildAgentBody(input);
    const actual = JSON.parse(JSON.stringify(b));
    actual.conversation_config.tts.model_id = "eleven_flash_v2_5";
    actual.conversation_config.agent.prompt.tools.push({ name: "crm_lookup" });
    delete actual.platform_settings;
    const fields = diffAgent(b, actual).map((d) => d.field);
    expect(fields).toContain("Modelo de voz");
    expect(fields).toContain("Ferramentas repetidas");
    expect(fields).toContain("Webhook de início (contexto do CRM)");
  });
  it("ferramentas da equipe viram webhook com a identidade da ligação preenchida pela ElevenLabs", () => {
    const b = buildAgentBody({
      ...input,
      teamTools: [
        {
          name: "open_ticket",
          description: "Abre chamado",
          parameters: {
            type: "object",
            properties: {
              subject: { type: "string", description: "Título" },
              priority: { type: "string", description: "Prioridade", enum: ["low", "high"] },
            },
            required: ["subject"],
          },
        },
        { name: "book", description: "duplicada da legada", parameters: { type: "object" } },
        { name: "save_fields", description: "Grava", parameters: { type: "object" }, async: true },
      ],
    });
    const tools = b.conversation_config.agent.prompt.tools as {
      name: string;
      execution_mode?: string;
      api_schema: {
        url: string;
        request_body_schema: {
          properties: Record<string, Record<string, string>>;
          required?: string[];
        };
      };
    }[];
    expect(tools.filter((t) => t.api_schema).map((t) => t.name)).toEqual([
      "crm_lookup",
      "book",
      "open_ticket",
      "save_fields",
    ]);
    const ticket = tools.find((t) => t.name === "open_ticket")!;
    expect(ticket.api_schema.url).toBe(
      "https://app.test/api/public/voice/tool?a=acc&t=open_ticket&g=ag",
    );
    expect(
      ticket.api_schema.request_body_schema.properties["contact_id"]!["dynamic_variable"],
    ).toBe("contact_id");
    expect(ticket.api_schema.request_body_schema.properties["priority"]!["description"]).toContain(
      "low, high",
    );
    expect(ticket.api_schema.request_body_schema.required).toEqual(["subject"]);
    expect(tools.find((t) => t.name === "save_fields")!.execution_mode).toBe("async");
  });
  it("voz natural, caixa postal e coleta de dados por padrão", () => {
    const b = buildAgentBody(input);
    expect(b.conversation_config.agent.prompt.llm).toBe("gpt-5.4-mini");
    expect(b.conversation_config.turn.turn_eagerness).toBe("patient");
    expect(b.conversation_config.vad.background_voice_detection).toBe(true);
    const sys = (b.conversation_config.agent.prompt.tools as { name: string; type: string }[])
      .filter((t) => t.type === "system")
      .map((t) => t.name);
    expect(sys).toEqual(["end_call", "voicemail_detection"]);
    expect("built_in_tools" in b.conversation_config.agent.prompt).toBe(false);
    expect(Object.keys(b.platform_settings.data_collection)).toContain("pediu_para_nao_ligar");
  });
  it("abertura muda com o sentido da ligação", async () => {
    const { outboundOpening } = await import("./agent-sync");
    expect(outboundOpening("Marina Souza", "Clara", "Clínica Teste")).toBe(
      "Oi, Marina? Aqui é a Clara, da Clínica Teste. Tudo bem?",
    );
    expect(outboundOpening("", "Clara", "Clínica Teste")).toBe(
      "Oi, tudo bem? Aqui é a Clara, da Clínica Teste.",
    );
    const b = buildAgentBody({ ...input, firstMessage: "" });
    expect(b.conversation_config.agent.first_message).toBe("{{abertura}}");
    expect(
      b.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders["abertura"],
    ).toBe("Acme, Ana falando. Tudo bem?");
  });
});
