// Ferramentas com que a assistente FAZ o trabalho pela conversa (WhatsApp, base, atendente, regras,
// equipe, clientes, catálogo e diagnóstico). Só a especificação: o que o modelo lê para escolher.
// A execução fica em runners/*.server.ts. Puro, testado sem rede.
import type { ToolSpec } from "@/backend/agents/tool-loop";
import { RULES } from "@/features/posvenda/rules";

const str = (description: string) => ({ type: "string", description }) as const;
const bool = (description: string) => ({ type: "boolean", description }) as const;
const none = { type: "object", properties: {} } as const;

const CONFIRM = bool(
  "true só depois que a pessoa disse sim nesta conversa (a ferramenta avisa quando precisa)",
);

const RULE_LIST = RULES.map((r) => `${r.key} (${r.title})`).join(", ");

export const WORK_TOOLS: ToolSpec[] = [
  {
    name: "conectar_whatsapp",
    description:
      "Conecta o WhatsApp da empresa por QR Code AQUI NA CONVERSA. Chame sem argumentos: se faltar o servidor, aparece na tela o formulário seguro para colar o endereço e a chave; se o servidor já está salvo, aparece o QR Code, que vira Conectado sozinho. Se a pessoa já colou o endereço e a chave na conversa, passe os dois. Use também para 'gerar outro QR Code' (novo_qr) e 'conectar outro número' (outro_numero).",
    parameters: {
      type: "object",
      properties: {
        endereco: str("endereço do servidor, começa com https:// (só se a pessoa escreveu)"),
        chave: str("chave do servidor (só se a pessoa colou na conversa; nunca repita)"),
        novo_qr: bool("true para gerar outro código quando o anterior venceu"),
        outro_numero: bool("true para conectar um número a mais"),
      },
    },
  },
  {
    name: "ver_whatsapp",
    description:
      "Confere ao vivo se o WhatsApp está conectado, esperando a leitura do QR Code ou desconectado.",
    parameters: none,
  },
  {
    name: "desconectar_whatsapp",
    description:
      "Desconecta o número do WhatsApp da central (a central para de receber e responder até ler outro QR Code).",
    parameters: { type: "object", properties: { confirmado: CONFIRM } },
  },
  {
    name: "listar_conhecimento",
    description:
      "Lista o que já está na base de conhecimento do atendente (arquivos, textos, páginas do site) e o estado de cada item: pronto, lendo ou com erro.",
    parameters: none,
  },
  {
    name: "apagar_conhecimento",
    description: "Apaga um item da base de conhecimento pelo título.",
    parameters: {
      type: "object",
      properties: { titulo: str("título do item, como aparece na lista"), confirmado: CONFIRM },
      required: ["titulo"],
    },
  },
  {
    name: "configurar_atendente",
    description:
      "Cria e ajusta o atendente de IA que responde os clientes no WhatsApp. Se ainda não existe, cria pelo modelo de pós-venda e já liga. Use para: criar, ligar, desligar, renomear, mudar a saudação, o tom, dar orientações ('seja mais direto', 'nunca prometa prazo'), dizer o que fazer quando não sabe e quando passar para uma pessoa. Preencha só o que a pessoa pediu.",
    parameters: {
      type: "object",
      properties: {
        ligado: bool("true liga (cria se não existir); false desliga"),
        nome: str("nome do atendente, ex.: Bia"),
        saudacao: str("primeira mensagem que ele manda ao cliente"),
        tom: str("jeito de falar, ex.: próximo e direto, sem gírias"),
        orientacoes: {
          type: "array",
          items: { type: "string" },
          description: "orientações novas, uma por item, na forma de ordem para o atendente",
        },
        tirar_orientacao: str("trecho de uma orientação que deve sair"),
        quando_nao_sabe: str("o que ele faz quando não sabe a resposta"),
        passar_para_humano: str("em que situações ele passa a conversa para uma pessoa"),
        mensagem_ao_passar: str("o que ele diz ao cliente quando passa para uma pessoa"),
      },
    },
  },
  {
    name: "testar_atendente",
    description:
      "Testa o atendente aqui na conversa: manda uma pergunta como se fosse um cliente e mostra a resposta. Nada é enviado a cliente de verdade. Use quando a pessoa disser 'testa', 'pergunta como se fosse cliente' ou depois de mudar o atendente.",
    parameters: {
      type: "object",
      properties: { pergunta: str("o que o cliente escreveria, ex.: qual o prazo de troca?") },
      required: ["pergunta"],
    },
  },
  {
    name: "ver_regras",
    description:
      "Mostra as regras de pós-venda: quais estão ligadas, a mensagem e o prazo de cada uma e o teto de envios por dia.",
    parameters: none,
  },
  {
    name: "configurar_regras",
    description: `Liga, desliga e ajusta as regras de pós-venda (as mensagens que saem sozinhas no WhatsApp). 'Liga tudo' = todas: ligar. 'Desliga tudo' = todas: desligar. Para mudar uma regra, mande em regras: a chave, e só o que muda (ligada, mensagem, dias). Regras: ${RULE_LIST}. Na mensagem, {{primeiro_nome}} vira o nome do cliente. teto_diario é o máximo de mensagens automáticas por dia (0 = sem teto).`,
    parameters: {
      type: "object",
      properties: {
        todas: { type: "string", enum: ["ligar", "desligar"] },
        regras: {
          type: "array",
          items: {
            type: "object",
            properties: {
              regra: str("chave da regra"),
              ligada: bool("true liga, false desliga"),
              mensagem: str("texto novo que o cliente recebe"),
              dias: { type: "number", description: "prazo novo em dias" },
            },
            required: ["regra"],
          },
        },
        teto_diario: { type: "number", description: "máximo de envios por dia (0 a 500)" },
      },
    },
  },
  {
    name: "listar_equipe",
    description: "Lista quem tem acesso à central, o papel de cada pessoa e os convites em aberto.",
    parameters: none,
  },
  {
    name: "mudar_papel",
    description: "Muda o papel de alguém da equipe (ou de um convite ainda não aceito).",
    parameters: {
      type: "object",
      properties: {
        pessoa: str("nome ou e-mail da pessoa"),
        papel: { type: "string", enum: ["administrador", "gestor", "atendente", "vendedor"] },
      },
      required: ["pessoa", "papel"],
    },
  },
  {
    name: "cadastrar_clientes",
    description:
      "Cadastra clientes: um só ('cadastra a Maria, 11 98888-7777') ou uma lista colada (nome e telefone por linha; passe o texto inteiro em lista). Um cliente só entra como cliente NOVO e passa a receber as regras ligadas; lista entra como clientes antigos, sem boas-vindas. Mude isso com novo.",
    parameters: {
      type: "object",
      properties: {
        clientes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: str("nome"),
              telefone: str("telefone com DDD"),
              email: str("e-mail (opcional)"),
            },
            required: ["nome", "telefone"],
          },
        },
        lista: str("o texto colado pela pessoa, uma pessoa por linha"),
        novo: bool("true = acabou de comprar (entra nas regras); false = cliente antigo"),
        confirmado: CONFIRM,
      },
    },
  },
  {
    name: "marcar_cliente",
    description:
      "Marca um contato que já existe como cliente (ou tira a marca). Ao virar cliente ele entra nas regras de pós-venda ligadas.",
    parameters: {
      type: "object",
      properties: {
        pessoa: str("nome ou telefone do contato"),
        cliente: bool("true = é cliente; false = deixa de ser"),
        confirmado: CONFIRM,
      },
      required: ["pessoa"],
    },
  },
  {
    name: "consultar_clientes",
    description:
      "Consulta a carteira: quantos clientes, quantos em risco, quantos parados, quantos novos. Com busca, procura uma pessoa pelo nome ou telefone.",
    parameters: { type: "object", properties: { busca: str("nome ou telefone (opcional)") } },
  },
  {
    name: "importar_do_site",
    description:
      "Lê o site ou a loja online da empresa e traz o que ela vende (produtos e serviços, com preço quando o site mostra), o nome, o que vende, o tom de voz e as políticas (troca, entrega, garantia, horário, contato). Mostra a PRÉVIA na tela para a pessoa conferir, desmarcar e confirmar; só grava depois. Use sempre que a pessoa passar o endereço de um site, loja, cardápio ou página de serviços. Pode levar até 40 segundos.",
    parameters: {
      type: "object",
      properties: { url: str("endereço do site ou da loja") },
      required: ["url"],
    },
  },
  {
    name: "listar_catalogo",
    description:
      "Lista os produtos e serviços do catálogo, com preço. Com busca, filtra pelo nome.",
    parameters: { type: "object", properties: { busca: str("parte do nome (opcional)") } },
  },
  {
    name: "remover_produto",
    description: "Remove um produto ou serviço do catálogo pelo nome.",
    parameters: {
      type: "object",
      properties: { nome: str("nome do item"), confirmado: CONFIRM },
      required: ["nome"],
    },
  },
  {
    name: "diagnostico",
    description:
      "Confere se está tudo funcionando e o que falta: empresa, WhatsApp, atendente, base de conhecimento, regras, catálogo, agendador e a última mensagem recebida, com o que fazer em cada ponto. Use para 'o que falta configurar?', 'está tudo funcionando?', 'por que não respondeu?'.",
    parameters: none,
  },
];

export const WORK_TOOL_NAMES = WORK_TOOLS.map((t) => t.name);
