// Monta o agente da ElevenLabs a partir do cadastro e confere a leitura de volta campo a campo.
// A ElevenLabs devolve 200 para PATCH com chave errada e ignora em silêncio: só a leitura prova.
import { TOOL_LABEL } from "./agent-templates";

export interface AgentInput {
  name: string;
  prompt: string;
  firstMessage: string;
  voiceId: string;
  modelId: string;
  language: string;
  knowledge: string | null;
  tools: string[];
  transferNumber: string | null;
  baseUrl: string;
  accountId: string;
  agentRowId: string;
  toolSecret: string;
  companyName: string;
  agentName: string;
  postCallWebhookId?: string | null;
  /** Modelo que roda DENTRO da ElevenLabs (1ª palavra ~0,6 s; Custom LLM no Lovable dava ~3 s). */
  llm?: string;
  /** Ferramentas da equipe (as mesmas do texto), executadas pelo Vínculo via webhook. */
  teamTools?: { name: string; description: string; parameters: JsonSchemaLite; async?: boolean }[];
  /** O que a ElevenLabs extrai de cada ligação (vai para calls.data_collection e para a ficha). */
  dataCollection?: Record<string, { type: "string" | "boolean" | "number"; description: string }>;
  /** Palavras que o ouvido precisa acertar (empresa, produtos, nomes). */
  keywords?: string[];
  voicemailMessage?: string;
}

export interface JsonSchemaLite {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaLite>;
  required?: string[];
  items?: JsonSchemaLite;
  enum?: unknown[];
}

/** Padrão da voz natural (copiado da Lia/Likes, medida em ligação real em 28/10). */
export const VOICE_LLM = "gpt-5.4-mini";

/** Campos que toda ligação coleta: viram ficha, tarefa de retorno e saída da lista. */
export const BASE_DATA_COLLECTION: Record<
  string,
  { type: "string" | "boolean" | "number"; description: string }
> = {
  interesse: {
    type: "string",
    description: "Interesse da pessoa em uma frase, nas palavras dela.",
  },
  proximo_passo: { type: "string", description: "O que ficou combinado como próximo passo." },
  quer_retorno: {
    type: "boolean",
    description: "true se a pessoa pediu ou aceitou que alguém da equipe retorne.",
  },
  horario_retorno: {
    type: "string",
    description: "Melhor horário para o retorno, se a pessoa disse (ex.: 'amanhã de manhã').",
  },
  objecao: { type: "string", description: "Principal objeção ou dúvida que ficou sem resposta." },
  pediu_para_nao_ligar: {
    type: "boolean",
    description: "true SÓ se a pessoa pediu explicitamente para não receber mais ligações.",
  },
};

// O ElevenLabs só aceita tipos simples nas propriedades do webhook.
function flatProps(schema: JsonSchemaLite | undefined) {
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(schema?.properties ?? {})) {
    const t =
      v.type === "number" || v.type === "integer" || v.type === "boolean" ? v.type : "string";
    const extra = v.enum?.length ? ` Valores: ${v.enum.join(", ")}.` : "";
    out[k] = { type: t, description: `${v.description ?? k}${extra}`.slice(0, 400) };
  }
  return out;
}

// Identidade da ligação preenchida pela própria ElevenLabs (o modelo não precisa adivinhar).
const CALL_IDENTITY = {
  contact_id: { type: "string", dynamic_variable: "contact_id" },
  caller_phone: { type: "string", dynamic_variable: "caller_phone" },
  conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
};

const TOOL_SPECS: Record<
  string,
  {
    description: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  }
> = {
  crm_lookup: {
    description:
      "Consulta o CRM: histórico, negócios abertos, próxima reunião e resumo da IA sobre este contato. Use antes de perguntar algo que já possa estar registrado.",
    properties: {
      caller_phone: {
        type: "string",
        description: "Telefone da pessoa (variável system__caller_id ou to_number).",
      },
    },
  },
  slots: {
    description:
      "Lista até 4 horários livres para reunião nos próximos dias. Leia em voz alta e peça para a pessoa escolher.",
    properties: {
      preferencia: {
        type: "string",
        description: "Preferência dita pela pessoa: 'manhã', 'tarde', 'amanhã', um dia da semana.",
      },
    },
  },
  book: {
    description:
      "Agenda a reunião no horário escolhido (use um start_iso devolvido por slots). Manda o convite por e-mail e WhatsApp.",
    properties: {
      start_iso: { type: "string", description: "Início no formato ISO devolvido por slots." },
      caller_phone: { type: "string", description: "Telefone da pessoa." },
      nome: { type: "string", description: "Nome da pessoa, se ainda não sabíamos." },
      email: { type: "string", description: "E-mail para o convite, se a pessoa informou." },
    },
    required: ["start_iso"],
  },
  create_ticket: {
    description:
      "Abre um chamado para o time humano resolver depois, com um resumo claro do problema.",
    properties: {
      assunto: { type: "string", description: "Assunto curto." },
      resumo: { type: "string", description: "O que a pessoa precisa, em 2 a 4 frases." },
      caller_phone: { type: "string", description: "Telefone da pessoa." },
    },
    required: ["assunto", "resumo"],
  },
  update_deal: {
    description:
      "Registra no negócio o que foi qualificado (necessidade, prazo, decisor, orçamento) e o próximo passo.",
    properties: {
      caller_phone: { type: "string", description: "Telefone da pessoa." },
      necessidade: { type: "string", description: "O que a pessoa precisa." },
      prazo: { type: "string", description: "Quando pretende resolver." },
      decisor: { type: "string", description: "Quem decide." },
      orcamento: { type: "string", description: "Orçamento mencionado." },
      proximo_passo: { type: "string", description: "Próximo passo combinado." },
    },
  },
  route_to_queue: {
    description:
      "Passa a ligação para a equipe humana certa. Use quando a pessoa pedir um humano ou o assunto exigir um especialista. Antes, entenda o assunto e resuma o caso: quem atende recebe o resumo e o cliente não repete nada. A resposta diz se há alguém livre (então use transfer_to_number) ou se é melhor oferecer retorno ou WhatsApp.",
    properties: {
      assunto: {
        type: "string",
        description:
          "Assunto em poucas palavras, com as palavras da pessoa (ex.: 'boleto atrasado', 'suporte técnico', 'comprar').",
      },
      resumo: {
        type: "string",
        description: "Resumo do caso em 2 a 4 frases: quem é, o que quer, o que já foi dito.",
      },
      caller_phone: { type: "string", description: "Telefone da pessoa (system__caller_id)." },
      conversation_id: { type: "string", description: "Valor de system__conversation_id." },
    },
    required: ["assunto", "resumo"],
  },
  request_callback: {
    description:
      "Registra um retorno de ligação no lugar de esperar na fila. Use quando ninguém estiver livre e a pessoa aceitar receber a ligação depois (agora que alguém liberar ou num horário combinado).",
    properties: {
      caller_phone: { type: "string", description: "Telefone para o retorno, com DDD." },
      quando_iso: {
        type: "string",
        description:
          "Horário combinado no formato ISO, se a pessoa escolheu um. Vazio = assim que possível.",
      },
      assunto: { type: "string", description: "Assunto em poucas palavras." },
      resumo: { type: "string", description: "Resumo do caso para quem for retornar." },
      conversation_id: { type: "string", description: "Valor de system__conversation_id." },
    },
    required: ["resumo"],
  },
  send_whatsapp: {
    description: "Envia uma mensagem de WhatsApp para a pessoa (link, material, confirmação).",
    properties: {
      caller_phone: { type: "string", description: "Telefone da pessoa." },
      mensagem: { type: "string", description: "Texto curto da mensagem." },
    },
    required: ["mensagem"],
  },
};

export const DYNAMIC_DEFAULTS = (
  companyName: string,
  agentName: string,
): Record<string, string> => ({
  company_name: companyName || "nossa empresa",
  agent_name: agentName,
  lead_name: "",
  crm_context: "sem histórico",
  upcoming_meeting_human: "",
  caller_phone: "",
  contact_id: "",
  direcao: "entrada",
  motivo: "",
  // ligação recebida; a de saída manda a sua (outboundOpening) no disparo
  abertura: `${companyName || "Olá"}, ${agentName} falando. Tudo bem?`,
});

/** Primeira fala da ligação de saída: apresenta e confirma com quem fala. */
export function outboundOpening(leadName: string, agentName: string, companyName: string): string {
  const first = leadName.trim().split(/\s+/)[0] ?? "";
  return first
    ? `Oi, ${first}? Aqui é a ${agentName}, da ${companyName}. Tudo bem?`
    : `Oi, tudo bem? Aqui é a ${agentName}, da ${companyName}.`;
}

/**
 * Ferramentas de sistema (desligar, caixa postal, transferir) vão DENTRO de prompt.tools com
 * type "system". Em built_in_tools a ElevenLabs apaga em silêncio no PATCH (lido de volta:
 * null): nenhum agente de voz do produto conseguia desligar até 28/10.
 */
export function systemTools(i: Pick<AgentInput, "voicemailMessage" | "transferNumber">) {
  const sys = (name: string, description: string, params: Record<string, unknown>) => ({
    type: "system" as const,
    name,
    description,
    params: { system_tool_type: name, ...params },
  });
  return [
    sys(
      "end_call",
      "Desliga a ligação. Chame SEMPRE que a pessoa disser tchau, até mais, valeu, pode encerrar ou pedir para parar, e depois de deixar recado na caixa postal: uma frase de despedida e esta ferramenta na mesma resposta, sem esperar resposta e sem chamar outra ferramenta.",
      {},
    ),
    sys(
      "voicemail_detection",
      "Só para caixa postal com mensagem gravada pedindo recado. Nunca use para música de espera, transferência ou silêncio.",
      {
        voicemail_message:
          i.voicemailMessage ??
          "Oi, aqui é a {{agent_name}}, da {{company_name}}. Liguei sobre {{motivo}}. Ligo de novo mais tarde. Obrigada!",
      },
    ),
    ...(i.transferNumber
      ? [
          sys(
            "transfer_to_number",
            "Transfere para um humano quando a pessoa pedir ou o assunto fugir do que você sabe.",
            {
              transfers: [
                {
                  transfer_destination: { type: "phone", phone_number: i.transferNumber },
                  condition:
                    "A pessoa pediu para falar com um humano ou o assunto exige um especialista.",
                },
              ],
            },
          ),
        ]
      : []),
  ];
}

export function buildAgentBody(i: AgentInput) {
  const toolUrl = (t: string) => `${i.baseUrl}/api/public/voice/tool?a=${i.accountId}&t=${t}`;
  const tools = i.tools
    .filter((t) => TOOL_SPECS[t])
    .map((t) => ({
      type: "webhook",
      name: t,
      description: TOOL_SPECS[t]!.description,
      api_schema: {
        url: toolUrl(t),
        method: "POST",
        request_headers: { "x-nexus-tool-secret": i.toolSecret },
        request_body_schema: {
          type: "object",
          // telefone/contato/ligação vêm da própria ElevenLabs: o modelo pedia o número à pessoa
          properties: {
            ...Object.fromEntries(
              Object.entries(TOOL_SPECS[t]!.properties).filter(([k]) => !(k in CALL_IDENTITY)),
            ),
            ...CALL_IDENTITY,
          },
          ...(TOOL_SPECS[t]!.required ? { required: TOOL_SPECS[t]!.required } : {}),
        },
      },
    }));
  const legacyNames = new Set(tools.map((t) => t.name));
  const team = (i.teamTools ?? [])
    .filter((t) => !legacyNames.has(t.name))
    .map((t) => ({
      type: "webhook",
      name: t.name,
      description: t.description.slice(0, 900),
      // efeito colateral sem resposta necessária: ela segue falando enquanto o Vínculo grava
      execution_mode: t.async ? "async" : "immediate",
      api_schema: {
        url: `${toolUrl(t.name)}&g=${i.agentRowId}`,
        method: "POST",
        request_headers: { "x-nexus-tool-secret": i.toolSecret },
        request_body_schema: {
          type: "object",
          properties: { ...flatProps(t.parameters), ...CALL_IDENTITY },
          ...(t.parameters.required?.length ? { required: t.parameters.required } : {}),
        },
      },
    }));
  const allTools = [...tools, ...team];
  const prompt = i.knowledge?.trim()
    ? `${i.prompt}\n\nBase de conhecimento (use só isto para fatos da empresa):\n${i.knowledge.trim()}`
    : i.prompt;
  return {
    name: `Vínculo · ${i.name}`,
    conversation_config: {
      agent: {
        // vazio = a abertura muda com o sentido da ligação ({{abertura}})
        first_message: i.firstMessage.trim() || "{{abertura}}",
        language: i.language,
        dynamic_variables: {
          dynamic_variable_placeholders: DYNAMIC_DEFAULTS(i.companyName, i.agentName),
        },
        prompt: {
          prompt,
          llm: i.llm ?? VOICE_LLM,
          max_tokens: 400,
          temperature: 0.5,
          tools: [...allTools, ...systemTools(i)],
        },
      },
      // voz natural: expressiva, espera a pessoa terminar, ignora voz de fundo e não enche linguiça
      tts: {
        model_id: i.modelId,
        voice_id: i.voiceId,
        stability: 0.38,
        similarity_boost: 0.8,
        speed: 1.0,
        optimize_streaming_latency: 3,
        expressive_mode: true,
      },
      asr: { quality: "high", keywords: (i.keywords ?? []).slice(0, 50) },
      turn: {
        turn_timeout: 7,
        turn_eagerness: "patient",
        silence_end_call_timeout: 30,
        soft_timeout_config: { timeout_seconds: -1, message: "…" },
      },
      vad: { background_voice_detection: true },
      conversation: { max_duration_seconds: 900 },
    },
    platform_settings: {
      summary_language: "pt",
      data_collection: Object.fromEntries(
        Object.entries(i.dataCollection ?? BASE_DATA_COLLECTION).map(([k, v]) => [
          k,
          { type: v.type, description: v.description },
        ]),
      ),
      overrides: {
        enable_conversation_initiation_client_data_from_webhook: true,
        custom_llm_extra_body: true,
      },
      workspace_overrides: {
        conversation_initiation_client_data_webhook: {
          url: `${i.baseUrl}/api/public/voice/init?a=${i.accountId}&g=${i.agentRowId}`,
          request_headers: { "x-nexus-tool-secret": i.toolSecret },
        },
        // transcrição E falha ao iniciar (não atendeu, ocupado): sem esta, a ligação ficava
        // "chamando" para sempre no Vínculo
        ...(i.postCallWebhookId
          ? {
              webhooks: {
                post_call_webhook_id: i.postCallWebhookId,
                events: ["transcript", "call_initiation_failure"],
              },
            }
          : {}),
      },
    },
  };
}

type Json = Record<string, unknown>;
function at(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Json)[k] : undefined),
    obj,
  );
}

export interface FieldDiff {
  field: string;
  expected: string;
  actual: string;
}

// Confere o que a ElevenLabs gravou de verdade.
export function diffAgent(
  expected: ReturnType<typeof buildAgentBody>,
  actual: unknown,
): FieldDiff[] {
  const checks: [string, string[]][] = [
    ["Modelo de voz", ["conversation_config", "tts", "model_id"]],
    ["Voz", ["conversation_config", "tts", "voice_id"]],
    ["Primeira fala", ["conversation_config", "agent", "first_message"]],
    ["Idioma", ["conversation_config", "agent", "language"]],
    ["Prompt", ["conversation_config", "agent", "prompt", "prompt"]],
    ["Tamanho máximo da resposta", ["conversation_config", "agent", "prompt", "max_tokens"]],
    ["Modelo de linguagem", ["conversation_config", "agent", "prompt", "llm"]],
  ];
  const out: FieldDiff[] = [];
  for (const [label, path] of checks) {
    const e = at(expected, path);
    const a = at(actual, path);
    if (e !== undefined && String(e) !== String(a ?? ""))
      out.push({
        field: label,
        expected: String(e).slice(0, 80),
        actual: String(a ?? "(vazio)").slice(0, 80),
      });
  }
  const expectedTools =
    (
      at(expected, ["conversation_config", "agent", "prompt", "tools"]) as
        { name: string }[] | undefined
    )
      ?.map((t) => t.name)
      .sort() ?? [];
  const actualToolsRaw =
    (at(actual, ["conversation_config", "agent", "prompt", "tools"]) as
      { name: string }[] | undefined) ?? [];
  const actualTools = actualToolsRaw.map((t) => t.name).sort();
  if (!actualTools.includes("end_call"))
    out.push({ field: "Desligar a ligação (end_call)", expected: "presente", actual: "(sumiu)" });
  const dup = actualTools.filter((t, i) => actualTools.indexOf(t) !== i);
  if (dup.length)
    out.push({ field: "Ferramentas repetidas", expected: "sem repetição", actual: dup.join(", ") });
  if (expectedTools.join(",") !== [...new Set(actualTools)].join(","))
    out.push({
      field: "Ferramentas",
      expected: expectedTools.map((t) => TOOL_LABEL[t] ?? t).join(", ") || "(nenhuma)",
      actual: actualTools.join(", ") || "(nenhuma)",
    });
  const hook = at(actual, [
    "platform_settings",
    "workspace_overrides",
    "conversation_initiation_client_data_webhook",
    "url",
  ]);
  const expHook = at(expected, [
    "platform_settings",
    "workspace_overrides",
    "conversation_initiation_client_data_webhook",
    "url",
  ]);
  if (String(hook ?? "") !== String(expHook))
    out.push({
      field: "Webhook de início (contexto do CRM)",
      expected: String(expHook),
      actual: String(hook ?? "(vazio)"),
    });
  return out;
}
