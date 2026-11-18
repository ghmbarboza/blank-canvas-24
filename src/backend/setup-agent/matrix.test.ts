// Roteador de ferramentas com modelo simulado. O "modelo" é o próprio caminho de produção do
// gateway (chat/completions, o formato de quem não é Anthropic) com a rede trocada por respostas
// gravadas: assim o teste cobre o laço de várias ferramentas e o formato exato das mensagens.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";

import { EDITION, FULL_EDITION } from "@/lib/edition";

import { MATRIX } from "./matrix";
import { buildStageTools, buildWorkTools, friendlyStreamError } from "./nexa-tools";
import { MAX_STEPS } from "./nexa.server";
import type { ToolRun } from "./runner-types";
import { REPLY, SETUP_TOOLS, setupSystem, setupToolsFor, toolInEdition } from "./spec";
import { STAGE_TOOLS, type StoredPart } from "./stage";
import { setupToolNames } from "./tools.server";

const WORK = SETUP_TOOLS.filter((t) => t.name !== REPLY.name);

interface Step {
  calls?: { name: string; args: Record<string, unknown> }[];
  text?: string;
}

const sse = (events: unknown[]) =>
  new Response(
    [...events.map((e) => `data: ${JSON.stringify(e)}\n\n`), "data: [DONE]\n\n"].join(""),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );

function chunk(delta: Record<string, unknown>, finish: string | null) {
  return {
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "google/gemini-3.8-flash",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

/** Gateway de mentira: responde cada chamada com o próximo passo do roteiro e guarda os pedidos. */
function fakeGateway(steps: Step[]) {
  const requests: { messages: Record<string, unknown>[]; tools: Record<string, unknown>[] }[] = [];
  let n = 0;
  const fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")));
    const step = steps[Math.min(n, steps.length - 1)]!;
    const id = n++;
    if (step.calls?.length)
      return sse([
        chunk(
          {
            role: "assistant",
            content: null,
            tool_calls: step.calls.map((c, i) => ({
              index: i,
              id: `call_${id}_${i}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          },
          null,
        ),
        chunk({}, "tool_calls"),
      ]);
    return sse([chunk({ role: "assistant", content: step.text ?? "" }, null), chunk({}, "stop")]);
  });
  return { fetch, requests };
}

async function turn(
  steps: Step[],
  run: (name: string, args: Record<string, unknown>) => Promise<ToolRun>,
) {
  const gw = fakeGateway(steps);
  const parts: StoredPart[] = [];
  const model = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://gateway.test/v1",
    apiKey: "k",
    fetch: gw.fetch as unknown as typeof fetch,
  }).chatModel("google/gemini-3.8-flash");
  const result = streamText({
    model,
    system: "teste",
    messages: [{ role: "user", content: "pedido" }],
    tools: {
      ...buildWorkTools({ specs: WORK, run, parts }),
      ...buildStageTools(STAGE_TOOLS, parts),
    },
    stopWhen: stepCountIs(MAX_STEPS),
    maxRetries: 0,
  });
  const text = await result.text;
  return { text, parts, requests: gw.requests };
}

describe("matriz pedido → ferramenta", () => {
  const exposed = new Set(WORK.map((t) => t.name));
  const runners = new Set(setupToolNames());

  it("toda ferramenta da edição tem quem a execute, e toda ferramenta aparece na matriz", () => {
    for (const t of WORK) expect(runners.has(t.name), `sem execução: ${t.name}`).toBe(true);
    const covered = new Set(MATRIX.map((r) => r.ferramenta));
    // pesquisar na internet e escolher o menu inteiro são apoio, não pedido direto do dono
    const support = new Set(["pesquisar_web", "escolher_recursos"]);
    for (const t of WORK)
      if (!support.has(t.name)) expect(covered.has(t.name), `fora da matriz: ${t.name}`).toBe(true);
  });

  it("os argumentos de cada linha respeitam o que a ferramenta declara", () => {
    for (const row of MATRIX) {
      const spec = WORK.find((t) => t.name === row.ferramenta);
      expect(spec, `${row.pedido} → ${row.ferramenta} não está nesta edição`).toBeTruthy();
      const p = spec!.parameters as {
        properties?: Record<string, { enum?: unknown[] }>;
        required?: string[];
      };
      for (const key of Object.keys(row.args))
        expect(Object.keys(p.properties ?? {}), `${row.ferramenta}.${key}`).toContain(key);
      // confirmado nunca vem no primeiro pedido: a ferramenta é que pede a confirmação
      expect(row.args).not.toHaveProperty("confirmado");
      for (const [key, value] of Object.entries(row.args)) {
        const allowed = p.properties?.[key]?.enum;
        if (allowed) expect(allowed, `${row.ferramenta}.${key}`).toContain(value);
      }
    }
  });

  it.each(MATRIX.map((r) => [r.pedido, r] as const))("%s", async (_pedido, row) => {
    const run = vi.fn(async (): Promise<ToolRun> => ({ content: "feito" }));
    const r = await turn(
      [{ calls: [{ name: row.ferramenta, args: row.args }] }, { text: "Pronto." }],
      run,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(row.ferramenta, row.args);
    expect(r.text).toBe("Pronto.");
    expect(exposed.has(row.ferramenta)).toBe(true);
  });
});

describe("formato das mensagens de ferramenta no caminho chat/completions (modelo não Anthropic)", () => {
  it("manda as ferramentas como function e devolve o resultado como mensagem tool, em texto", async () => {
    const run = vi.fn(async (): Promise<ToolRun> => ({
      content: "QR Code na tela",
      block: { kind: "whatsapp", title: "Leia o QR Code", channelId: "c1" },
      action: { kind: "done", label: "QR Code gerado", tool: "conectar_whatsapp" },
    }));
    const r = await turn(
      [{ calls: [{ name: "conectar_whatsapp", args: {} }] }, { text: "O QR Code está na tela." }],
      run,
    );
    const [first, second] = r.requests;
    expect(first!.tools.length).toBe(WORK.length + STAGE_TOOLS.length);
    for (const t of first!.tools) {
      expect(t["type"]).toBe("function");
      const fn = t["function"] as { name: string; parameters: { type: string } };
      expect(fn.parameters.type).toBe("object");
    }
    const assistant = second!.messages.find((m) => m["role"] === "assistant") as {
      tool_calls: { id: string; type: string; function: { name: string; arguments: string } }[];
    };
    expect(assistant.tool_calls[0]!.function.name).toBe("conectar_whatsapp");
    const toolMsg = second!.messages.find((m) => m["role"] === "tool") as {
      tool_call_id: string;
      content: string;
    };
    expect(toolMsg.tool_call_id).toBe(assistant.tool_calls[0]!.id);
    // só o texto volta para a IA: o bloco e a ação ficam na tela
    expect(toolMsg.content).toBe("QR Code na tela");
    expect(JSON.stringify(second!.messages)).not.toContain("channelId");
    expect(r.parts.map((p) => p.type)).toEqual(["block", "action"]);
  });

  it("vários pedidos numa mensagem: encadeia as ferramentas em sequência e fala no fim", async () => {
    const run = vi.fn(async (name: string): Promise<ToolRun> => ({ content: `${name} ok` }));
    const r = await turn(
      [
        {
          calls: [
            {
              name: "salvar_empresa",
              args: { nome: "Bela Casa", ramo: "varejo", o_que_vende: "móveis" },
            },
          ],
        },
        {
          calls: [
            {
              name: "configurar_regras",
              args: { regras: [{ regra: "recompra", ligada: true, dias: 60 }] },
            },
          ],
        },
        { calls: [{ name: "configurar_atendente", args: { ligado: true } }] },
        { text: "Salvei a empresa, liguei a recompra em 60 dias e criei o atendente." },
      ],
      run,
    );
    expect(run.mock.calls.map((c) => c[0])).toEqual([
      "salvar_empresa",
      "configurar_regras",
      "configurar_atendente",
    ]);
    expect(r.requests).toHaveLength(4);
    expect(r.requests[3]!.messages.filter((m) => m["role"] === "tool")).toHaveLength(3);
    expect(r.text).toMatch(/Salvei a empresa/);
  });

  it("duas ferramentas na mesma volta: as duas rodam e cada resultado volta com o seu id", async () => {
    const run = vi.fn(async (name: string): Promise<ToolRun> => ({ content: `${name} ok` }));
    const r = await turn(
      [
        {
          calls: [
            { name: "salvar_empresa", args: { nome: "Bela Casa" } },
            { name: "cadastrar_produto", args: { nome: "Sofá Oslo", preco: "3499,90" } },
          ],
        },
        { text: "Feito." },
      ],
      run,
    );
    expect(run).toHaveBeenCalledTimes(2);
    const tools = r.requests[1]!.messages.filter((m) => m["role"] === "tool");
    expect(tools.map((m) => m["content"])).toEqual(["salvar_empresa ok", "cadastrar_produto ok"]);
    expect(new Set(tools.map((m) => m["tool_call_id"])).size).toBe(2);
  });

  it("ferramenta que falha: o erro volta em texto para a IA explicar, e vira aviso na tela", async () => {
    const r = await turn(
      [{ calls: [{ name: "conectar_whatsapp", args: {} }] }, { text: "O servidor não respondeu." }],
      async () => {
        throw new Error("O servidor não respondeu. Confira com o provedor.");
      },
    );
    const toolMsg = r.requests[1]!.messages.find((m) => m["role"] === "tool")!;
    expect(toolMsg["content"]).toBe("ERRO: O servidor não respondeu. Confira com o provedor.");
    expect(r.parts[0]).toMatchObject({ type: "action", action: { kind: "error" } });
    expect(r.text).toBe("O servidor não respondeu.");
  });

  it("a chave usada na ferramenta não volta no resultado que a IA lê", async () => {
    const r = await turn(
      [
        {
          calls: [
            {
              name: "conectar_whatsapp",
              args: { endereco: "https://evo.loja.com.br", chave: "lojabonita" },
            },
          ],
        },
        { text: "Guardei a chave no cofre." },
      ],
      async () => ({ content: "servidor salvo com a chave lojabonita", secrets: ["lojabonita"] }),
    );
    const toolMsg = r.requests[1]!.messages.find((m) => m["role"] === "tool")!;
    expect(String(toolMsg["content"])).not.toContain("lojabonita");
  });

  it("o laço para no limite de voltas mesmo se o modelo insistir em ferramenta", async () => {
    let i = 0;
    const run = vi.fn(async (): Promise<ToolRun> => ({ content: "ok" }));
    const r = await turn(
      Array.from({ length: 40 }, () => ({
        calls: [
          {
            name: "guardar_informacao",
            args: { chave: `k${i++}`, rotulo: "x", valor: "y", categoria: "outros" },
          },
        ],
      })),
      run,
    );
    expect(r.requests.length).toBe(MAX_STEPS);
    expect(MAX_STEPS).toBeGreaterThanOrEqual(8);
  });

  it("bloco desenhado pela IA (mostrar_opcoes) entra na tela e a IA recebe só o aviso", async () => {
    const r = await turn(
      [
        {
          calls: [
            {
              name: "mostrar_opcoes",
              args: {
                titulo: "Próximo passo",
                opcoes: [{ titulo: "Conectar o WhatsApp" }, { titulo: "Depois" }],
              },
            },
          ],
        },
        { text: "**Vamos conectar o WhatsApp?**" },
      ],
      async () => ({ content: "" }),
    );
    expect(r.parts[0]).toMatchObject({ type: "block", block: { kind: "choices" } });
    expect(String(r.requests[1]!.messages.find((m) => m["role"] === "tool")!["content"])).toMatch(
      /Na tela/,
    );
  });
});

describe("ferramentas por edição", () => {
  it("nesta edição: WhatsApp por QR Code na conversa, sem avaliação de 90% nem agente livre", () => {
    const names = setupToolsFor(EDITION).map((t) => t.name);
    for (const n of [
      "conectar_whatsapp",
      "configurar_atendente",
      "configurar_regras",
      "importar_do_site",
      "diagnostico",
    ])
      expect(names).toContain(n);
    for (const n of ["criar_agente", "avaliar_agente", "conectar_integracao", "link_whatsapp"])
      expect(names).not.toContain(n);
    expect(toolInEdition("criar_agente", FULL_EDITION)).toBe(true);
  });
});

describe("prompt da assistente", () => {
  const system = setupSystem({
    snapshot: {
      company: "Bela Casa",
      segment: "varejo",
      ai: "IA inclusa da plataforma",
      aiMode: null,
      integrations: [{ id: "evolution", status: "connected" }],
      channels: [],
      agents: [{ name: "Bia", status: "active", role: "post_sale" }],
      team: 1,
      documents: 2,
      wishes: 0,
      modules: [],
      rulesOn: 2,
      rulesOnKeys: ["boas_vindas", "recompra"],
      products: 12,
      whatsappPending: true,
      whatsappServer: true,
      firstWin: { received: false, replied: false, deal: false },
    },
    facts: [],
    person: "Ana",
    today: "quarta-feira, 18 de novembro de 2026",
    stage: true,
  });
  it("leva o retrato real da conta: canal, atendente, regras e catálogo", () => {
    expect(system).toContain("WhatsApp: QR Code gerado, esperando a leitura no celular");
    expect(system).toContain("Atendente de IA: Bia (ligado)");
    expect(system).toContain("Regras de pós-venda ligadas: boas_vindas, recompra");
    expect(system).toContain("Catálogo: 12 item(ns)");
  });
  it("manda fazer em vez de mandar a pessoa ir fazer, uma pergunta por vez, sem jargão", () => {
    expect(system).toContain("FAÇA, não mande fazer");
    expect(system).toContain("UMA pergunta por vez");
    expect(system).toContain("execute TODAS");
    expect(system).toMatch(/PROIBIDO dizer: webhook, endpoint, API, instância, token/);
  });
  it("não usa travessão nem nome antigo do produto", () => {
    const all = [system, ...SETUP_TOOLS.map((t) => t.description)].join("\n");
    expect(all).not.toContain("—");
    for (const banned of ["Nexus", "Nexa", "Vínculo", "Viver de IA"])
      expect(all).not.toContain(banned);
  });
  it("erro do provedor de IA vira frase clara (crédito, limite, demora)", () => {
    expect(friendlyStreamError({ statusCode: 402, message: "Payment Required" })).toMatch(
      /crédito de IA/,
    );
    expect(friendlyStreamError({ statusCode: 429, message: "Too Many Requests" })).toMatch(
      /Muita gente/,
    );
    expect(
      friendlyStreamError(new DOMException("The operation timed out", "TimeoutError")),
    ).toMatch(/Demorei demais/);
    expect(friendlyStreamError(new Error("boom"))).toMatch(/Tentar de novo/);
  });
});
