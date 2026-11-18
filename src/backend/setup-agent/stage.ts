// Palco da Nexa: as ferramentas mostrar_* não mudam nada na central, só desenham tela
// (opções, formulário, cartões, etapas). O modelo manda o pedido; aqui ele vira um bloco
// validado, com limites, que o front desenha e a conversa guarda. Puro: servidor e front usam.
import type { ToolSpec } from "@/backend/agents/tool-loop";

export const STAGE_ICONS = [
  "saude",
  "imovel",
  "loja",
  "empresa",
  "carro",
  "escola",
  "whatsapp",
  "instagram",
  "email",
  "telefone",
  "agente",
  "equipe",
  "documento",
  "site",
  "anuncio",
  "calendario",
  "chave",
  "estrela",
  "outro",
] as const;
export type StageIcon = (typeof STAGE_ICONS)[number];

export const FIELD_TYPES = ["texto", "texto_longo", "email", "url", "telefone", "segredo"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface StageOption {
  label: string;
  description?: string;
  icon?: StageIcon;
}
export interface StageField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  optional: boolean;
}
export interface StageCard {
  title: string;
  text: string;
  icon?: StageIcon;
  image?: string;
}
export type StepState = "feito" | "agora" | "depois";

export type StageBlock =
  | { kind: "choices"; title: string; hint?: string; multiple: boolean; options: StageOption[] }
  | { kind: "form"; title: string; hint?: string; submit: string; fields: StageField[] }
  | { kind: "cards"; title: string; hint?: string; cards: StageCard[] }
  | { kind: "steps"; title: string; hint?: string; steps: { label: string; state: StepState }[] };

/** Ação que uma ferramenta deixou para a pessoa (botão de link, tela, feito, erro). */
export interface StageAction {
  kind: "link" | "open" | "done" | "error";
  label: string;
  url?: string;
  to?: string;
  tool: string;
}

/** O que fica gravado de cada resposta, na ordem: fala, blocos do palco e ações. */
export interface StoredPart {
  type: "text" | "block" | "action";
  text?: string;
  block?: StageBlock;
  action?: StageAction;
}

const LIMITS = { options: 8, fields: 6, cards: 6, steps: 8 } as const;

const str = (description: string) => ({ type: "string", description }) as const;
const icon = { type: "string", enum: [...STAGE_ICONS], description: "ícone (opcional)" } as const;

export const STAGE_TOOLS: ToolSpec[] = [
  {
    name: "mostrar_opcoes",
    description:
      "Desenha no palco botões de escolha para a pessoa clicar (ramo, canal, tom de voz, sim/não, próximo passo). A escolha volta como mensagem 'Escolhi: …'.",
    parameters: {
      type: "object",
      properties: {
        titulo: str("título curto, ex.: Qual é o ramo da empresa?"),
        dica: str("uma linha de apoio (opcional)"),
        multipla: { type: "boolean", description: "true se pode escolher mais de uma" },
        opcoes: {
          type: "array",
          description: "de 2 a 8 opções",
          items: {
            type: "object",
            properties: {
              titulo: str("texto do botão"),
              descricao: str("detalhe curto (opcional)"),
              icone: icon,
            },
            required: ["titulo"],
          },
        },
      },
      required: ["titulo", "opcoes"],
    },
  },
  {
    name: "mostrar_formulario",
    description:
      "Desenha no palco um formulário curto (até 6 campos) quando precisar de vários dados de uma vez. Para chave de API use tipo 'segredo'. Volta como mensagem 'Campo: valor'.",
    parameters: {
      type: "object",
      properties: {
        titulo: str("título curto"),
        dica: str("uma linha de apoio (opcional)"),
        botao: str("texto do botão, ex.: Salvar"),
        campos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: str("identificador snake_case"),
              rotulo: str("rótulo que a pessoa vê"),
              tipo: { type: "string", enum: [...FIELD_TYPES] },
              exemplo: str("texto de exemplo dentro do campo (opcional)"),
              opcional: { type: "boolean" },
            },
            required: ["rotulo"],
          },
        },
      },
      required: ["titulo", "campos"],
    },
  },
  {
    name: "mostrar_cartoes",
    description:
      "Desenha cartões no palco: o que já foi configurado, caminhos possíveis, um resumo. Só informação, sem clique.",
    parameters: {
      type: "object",
      properties: {
        titulo: str("título curto"),
        dica: str("uma linha de apoio (opcional)"),
        cartoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: str("título do cartão"),
              texto: str("até 2 frases"),
              icone: icon,
              imagem: str("endereço https de uma imagem (opcional, só se veio do site da empresa)"),
            },
            required: ["titulo"],
          },
        },
      },
      required: ["titulo", "cartoes"],
    },
  },
  {
    name: "mostrar_etapas",
    description: "Desenha um plano em etapas no palco, com o que está feito, o atual e o que vem.",
    parameters: {
      type: "object",
      properties: {
        titulo: str("título curto"),
        dica: str("uma linha de apoio (opcional)"),
        etapas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: str("nome da etapa"),
              estado: { type: "string", enum: ["feito", "agora", "depois"] },
            },
            required: ["titulo"],
          },
        },
      },
      required: ["titulo", "etapas"],
    },
  },
];

export const STAGE_TOOL_NAMES = new Set(STAGE_TOOLS.map((t) => t.name));

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function iconOf(v: unknown): StageIcon | undefined {
  return (STAGE_ICONS as readonly string[]).includes(v as string) ? (v as StageIcon) : undefined;
}

/** Itens de lista podem vir como objeto ou como texto solto ("Título — detalhe"). */
function items(v: unknown): Record<string, unknown>[] {
  let list: unknown = v;
  if (typeof v === "string") {
    try {
      list = JSON.parse(v);
    } catch {
      list = v.split(/\n|;/);
    }
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((it) => {
    if (it && typeof it === "object") return [it as Record<string, unknown>];
    if (typeof it !== "string" || !it.trim()) return [];
    const [titulo, ...rest] = it.split(/\s[—–-]\s/);
    return [{ titulo, descricao: rest.join(" - ") }];
  });
}

// imagem só de endereço https público ou do próprio app; nada de data:, javascript: ou http
function imageOf(v: unknown): string | undefined {
  const s = text(v, 500);
  if (s.startsWith("/nexa/")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function slug(v: string, i: number): string {
  const s = v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return s || `campo_${i + 1}`;
}

function head(a: Record<string, unknown>) {
  const title = text(a["titulo"], 120);
  const hint = text(a["dica"], 200);
  return { title, ...(hint ? { hint } : {}) };
}

/** Pedido da IA → bloco seguro para desenhar. Lança erro com motivo se não der para desenhar. */
export function toBlock(name: string, a: Record<string, unknown>): StageBlock {
  const h = head(a);
  if (!h.title) throw new Error("Falta o título");
  if (name === "mostrar_opcoes") {
    const options = items(a["opcoes"])
      .map((o) => {
        const label = text(o["titulo"] ?? o["label"], 60);
        const description = text(o["descricao"], 120);
        const ic = iconOf(o["icone"]);
        return { label, ...(description ? { description } : {}), ...(ic ? { icon: ic } : {}) };
      })
      .filter((o) => o.label)
      .slice(0, LIMITS.options);
    if (options.length < 2) throw new Error("Mande pelo menos 2 opções");
    return { kind: "choices", ...h, multiple: a["multipla"] === true, options };
  }
  if (name === "mostrar_formulario") {
    const seen = new Set<string>();
    const fields = items(a["campos"])
      .map((f, i): StageField => {
        const label = text(f["rotulo"] ?? f["titulo"], 60);
        let fieldName = slug(text(f["nome"], 40) || label, i);
        while (seen.has(fieldName)) fieldName = `${fieldName}_${i + 1}`;
        seen.add(fieldName);
        const type = (FIELD_TYPES as readonly string[]).includes(f["tipo"] as string)
          ? (f["tipo"] as FieldType)
          : "texto";
        const placeholder = text(f["exemplo"], 80);
        return {
          name: fieldName,
          label,
          type,
          ...(placeholder ? { placeholder } : {}),
          optional: f["opcional"] === true,
        };
      })
      .filter((f) => f.label)
      .slice(0, LIMITS.fields);
    if (!fields.length) throw new Error("Mande pelo menos 1 campo");
    return { kind: "form", ...h, submit: text(a["botao"], 30) || "Enviar", fields };
  }
  if (name === "mostrar_cartoes") {
    const cards = items(a["cartoes"])
      .map((c) => {
        const ic = iconOf(c["icone"]);
        const image = imageOf(c["imagem"]);
        return {
          title: text(c["titulo"], 80),
          text: text(c["texto"] ?? c["descricao"], 240),
          ...(ic ? { icon: ic } : {}),
          ...(image ? { image } : {}),
        };
      })
      .filter((c) => c.title)
      .slice(0, LIMITS.cards);
    if (!cards.length) throw new Error("Mande pelo menos 1 cartão");
    return { kind: "cards", ...h, cards };
  }
  if (name === "mostrar_etapas") {
    const steps = items(a["etapas"])
      .map((s) => {
        const state = s["estado"];
        return {
          label: text(s["titulo"], 60),
          state: (state === "feito" || state === "agora" ? state : "depois") as StepState,
        };
      })
      .filter((s) => s.label)
      .slice(0, LIMITS.steps);
    if (!steps.length) throw new Error("Mande pelo menos 1 etapa");
    return { kind: "steps", ...h, steps };
  }
  throw new Error(`Ferramenta de palco desconhecida: ${name}`);
}

/** Uma linha para o histórico: a IA lembra o que mostrou sem reler o bloco inteiro. */
export function blockNote(b: StageBlock): string {
  if (b.kind === "choices")
    return `[Na tela: ${b.title} → ${b.options.map((o) => o.label).join(" | ")}]`;
  if (b.kind === "form")
    return `[Na tela: formulário ${b.title} → ${b.fields.map((f) => f.label).join(", ")}]`;
  if (b.kind === "cards")
    return `[Na tela: ${b.title} → ${b.cards.map((c) => c.title).join(" | ")}]`;
  return `[Na tela: ${b.title} → ${b.steps.map((s) => `${s.label} (${s.state})`).join(", ")}]`;
}

/** Resposta pelo palco → a mensagem que a pessoa "diz" (segredo vai inteiro só nesta rodada). */
export function answerText(b: StageBlock, value: string[] | Record<string, string>): string {
  if (b.kind === "choices" && Array.isArray(value)) return `Escolhi: ${value.join(", ")}`;
  if (b.kind === "form" && !Array.isArray(value))
    return b.fields
      .filter((f) => value[f.name]?.trim())
      .map((f) => `${f.label}: ${value[f.name]!.trim()}`)
      .join("\n");
  return "";
}
