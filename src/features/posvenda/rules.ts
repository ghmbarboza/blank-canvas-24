// Regras de pós-venda: cada regra da tela é UMA automação do motor que já existe
// (features/automations), criada a partir daqui e achada depois pelo template_key "posvenda:<chave>".
// Lógica pura (sem banco): a tela e o servidor usam o mesmo mapa regra → automação.
import {
  DEFAULT_GUARDS,
  type AutoNode,
  type ExitRules,
  type Graph,
  type Guards,
  type Trigger,
} from "@/features/automations/engine";

import { DEFAULT_PRAZOS, PURCHASE_KEY, type Prazos } from "./moment";

/**
 * Contrato fixo com o onboarding: accounts.settings.posvenda.rules = { chave: boolean }.
 * As sete primeiras chaves não mudam; as duas últimas (prazos da compra) entraram depois.
 */
export const RULE_KEYS = [
  "boas_vindas",
  "checkin_7d",
  "pesquisa",
  "nota_baixa_chamado",
  "nota_alta_indicacao",
  "recompra",
  "cliente_parado",
  "fim_arrependimento",
  "fim_garantia",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export interface RuleDef {
  key: RuleKey;
  title: string;
  /** O que faz, em uma frase. */
  what: string;
  /** Quando dispara (com {dias} quando a regra tem prazo). */
  when: string;
  /** Mensagem que o cliente recebe; null = a regra não fala com o cliente. */
  message: string | null;
  /** Rótulo do campo de dias e o padrão; null = sem prazo editável. */
  days: { label: string; value: number; min: number; max: number } | null;
  /** Outra regra que precisa estar ligada para esta disparar. */
  needs?: RuleKey;
}

export const RULES: readonly RuleDef[] = [
  {
    key: "boas_vindas",
    title: "Boas-vindas",
    what: "Quem acabou de virar cliente recebe uma mensagem de boas-vindas no WhatsApp.",
    when: "Assim que o contato vira cliente.",
    message:
      "Oi {{primeiro_nome}}! Que bom ter você com a gente. Qualquer dúvida sobre a sua compra, é só chamar por aqui.",
    days: null,
  },
  {
    key: "checkin_7d",
    title: "Check-in de 7 dias",
    what: "Uma semana depois, pergunta se está tudo certo com a compra.",
    when: "{dias} dias depois que o contato vira cliente.",
    message:
      "Oi {{primeiro_nome}}, tudo certo por aí? Passando para saber como estão os primeiros dias. Se precisar de algo, me conta.",
    days: { label: "Dias depois da compra", value: 7, min: 1, max: 60 },
  },
  {
    key: "pesquisa",
    title: "Pesquisa de satisfação",
    what: "Pede uma nota de 0 a 10 e guarda a resposta em Pesquisas.",
    when: "{dias} dias depois que o contato vira cliente.",
    message:
      "{{primeiro_nome}}, de 0 a 10, quanto você recomendaria a gente para um amigo? Leva 10 segundos: {{link_pesquisa}}",
    days: { label: "Dias depois da compra", value: 14, min: 1, max: 120 },
  },
  {
    key: "nota_baixa_chamado",
    title: "Nota baixa vira chamado",
    what: "Nota de 0 a 6 abre um chamado com o que o cliente escreveu e avisa o responsável.",
    when: "Na hora em que o cliente responde a pesquisa com nota baixa.",
    message: null,
    days: null,
    needs: "pesquisa",
  },
  {
    key: "nota_alta_indicacao",
    title: "Nota alta pede indicação",
    what: "Nota 9 ou 10 recebe um agradecimento com pedido de avaliação ou indicação.",
    when: "Na hora em que o cliente responde a pesquisa com nota alta.",
    message:
      "{{primeiro_nome}}, obrigado pela nota! Se conhecer alguém que também ia gostar, pode indicar a gente? Uma avaliação sua ajuda muito. {{link_avaliacao}}",
    days: null,
    needs: "pesquisa",
  },
  {
    key: "recompra",
    title: "Hora de comprar de novo",
    what: "Lembra o cliente de comprar de novo quando chega a hora.",
    when: "{dias} dias depois que o contato vira cliente.",
    message:
      "Oi {{primeiro_nome}}! Já faz um tempo desde a sua compra. Quer que eu separe de novo para você?",
    days: { label: "Dias depois da compra", value: 30, min: 1, max: 365 },
  },
  {
    key: "cliente_parado",
    title: "Cliente parado",
    what: "Cliente sem conversa há muito tempo vai para Em risco e vira tarefa para o responsável.",
    when: "Quando o cliente fica {dias} dias sem conversa.",
    message: null,
    days: { label: "Dias sem conversa", value: 60, min: 7, max: 365 },
  },
  {
    key: "fim_arrependimento",
    title: "Fim do prazo de arrependimento",
    what: "Um dia antes de o prazo de arrependimento vencer, pergunta se está tudo certo com a compra.",
    when: "Um dia antes de vencer o prazo de arrependimento, contado da data da compra.",
    message:
      "Oi {{primeiro_nome}}, tudo certo com a sua compra? Se ficou alguma dúvida ou algo não saiu como você esperava, me conta por aqui que eu resolvo.",
    days: null,
  },
  {
    key: "fim_garantia",
    title: "Garantia perto do fim",
    what: "Avisa o cliente que a garantia está acabando e oferece ajuda antes de vencer.",
    when: "{dias} dias antes de a garantia vencer, contados da data da compra.",
    message:
      "Oi {{primeiro_nome}}! A garantia da sua compra vai até {{fim_garantia}}. Está tudo funcionando bem? Se precisar de algo, é só chamar por aqui.",
    days: { label: "Dias antes de a garantia vencer", value: 7, min: 1, max: 60 },
  },
];

export function ruleDef(key: RuleKey): RuleDef {
  return RULES.find((r) => r.key === key)!;
}

export const templateKeyFor = (key: RuleKey) => `posvenda:${key}`;

export function ruleKeyOf(templateKey: string | null | undefined): RuleKey | null {
  const k = (templateKey ?? "").replace(/^posvenda:/, "");
  return templateKey?.startsWith("posvenda:") && (RULE_KEYS as readonly string[]).includes(k)
    ? (k as RuleKey)
    : null;
}

// ------------------------------------------------------------------ teto do dia

export const DEFAULT_DAILY_CAP = 40;
export const MAX_DAILY_CAP = 500;

/**
 * Quantos WhatsApp as automações podem mandar por dia na conta (accounts.settings.posvenda.daily_cap).
 * Sem valor gravado vale 40, que é seguro para WhatsApp conectado por QR. 0 = sem teto.
 */
export function dailyCapOf(settings: unknown): number {
  const pv =
    settings && typeof settings === "object"
      ? (settings as { posvenda?: unknown }).posvenda
      : undefined;
  const raw = pv && typeof pv === "object" ? (pv as { daily_cap?: unknown }).daily_cap : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_DAILY_CAP;
  return Math.max(0, Math.min(MAX_DAILY_CAP, Math.round(raw)));
}

// ------------------------------------------------------------------ estado em accounts.settings

export type RuleFlags = Partial<Record<RuleKey, boolean>>;

export function ruleFlags(settings: unknown): RuleFlags {
  const pv =
    settings && typeof settings === "object"
      ? (settings as { posvenda?: unknown }).posvenda
      : undefined;
  const raw = pv && typeof pv === "object" ? (pv as { rules?: unknown }).rules : undefined;
  if (!raw || typeof raw !== "object") return {};
  const out: RuleFlags = {};
  for (const k of RULE_KEYS) if ((raw as Record<string, unknown>)[k] === true) out[k] = true;
  return out;
}

/** Novo settings com a regra marcada, sem perder as outras chaves de posvenda nem do settings. */
export function withRuleFlag<T extends Record<string, unknown>>(
  settings: T,
  key: RuleKey,
  on: boolean,
): T {
  const pv = (
    settings["posvenda"] && typeof settings["posvenda"] === "object" ? settings["posvenda"] : {}
  ) as Record<string, unknown>;
  const rules = (pv["rules"] && typeof pv["rules"] === "object" ? pv["rules"] : {}) as Record<
    string,
    unknown
  >;
  return { ...settings, posvenda: { ...pv, rules: { ...rules, [key]: on } } };
}

export function withDailyCap<T extends Record<string, unknown>>(settings: T, cap: number): T {
  const pv = (
    settings["posvenda"] && typeof settings["posvenda"] === "object" ? settings["posvenda"] : {}
  ) as Record<string, unknown>;
  return {
    ...settings,
    posvenda: { ...pv, daily_cap: Math.max(0, Math.min(MAX_DAILY_CAP, Math.round(cap))) },
  };
}

// ------------------------------------------------------------------ regra → automação

export interface RuleOptions {
  /** Texto que o cliente recebe (regras com mensagem). */
  message?: string;
  /** Prazo em dias (regras com prazo). */
  days?: number;
  /** Etapa "Em risco" do funil padrão, quando existe (regra cliente_parado). */
  atRiskStage?: { id: string; name: string } | null;
  /** Prazos da conta (regras fim_arrependimento e fim_garantia). Sem valor, vale o padrão. */
  prazos?: Prazos;
}

export interface RuleAutomation {
  template_key: string;
  name: string;
  description: string;
  kind: "journey" | "rule";
  trigger: Trigger;
  graph: Graph;
  exit_rules: ExitRules;
  guards: Guards;
  reentry: "never" | "after_exit" | "always";
}

const DAY = 1440;

// Quem está numa regra de pós-venda JÁ é cliente e pode responder à vontade: nada disso tira da regra.
const EXIT: ExitRules = {
  on_reply: false,
  on_meeting: false,
  on_customer: false,
  on_unsubscribe: true,
  on_deal_lost: false,
};

function chain(nodes: Omit<AutoNode, "position">[]): Graph {
  const map: Record<string, AutoNode> = {};
  nodes.forEach((n, i) => {
    map[n.id] = { ...n, position: { x: 260, y: 140 + i * 130 } };
  });
  return { start: nodes[0]?.id ?? null, nodes: map };
}

const END: Omit<AutoNode, "position"> = { id: "end", type: "end", config: {} };

/** Campo que o gatilho por data lê: a data da última compra do cliente. */
export const PURCHASE_FIELD = `custom.${PURCHASE_KEY}`;

/**
 * Gatilho "N dias depois da compra". O motor já tem o gatilho por data ("X dias antes de um campo");
 * dias negativos viram "depois", então nada muda no motor.
 */
function afterPurchase(days: number): Trigger {
  return { type: "date", field: PURCHASE_FIELD, days_before: days === 0 ? 0 : -Math.max(0, days) };
}

// A varredura por data olha o dia inteiro: a espera segura a inscrição aberta até o dia passar,
// para o cliente não entrar duas vezes na mesma data. Nova compra (nova data) entra de novo.
const HOLD: Omit<AutoNode, "position"> = {
  id: "hold",
  type: "wait",
  config: { minutes: 2 * 1440 },
  next: "end",
};

/** Quantos dias antes do fim da garantia a regra fim_garantia avisa (cabe dentro da garantia). */
export function garantiaLead(days: number | undefined, prazos: Prazos): number {
  const def = RULES.find((r) => r.key === "fim_garantia")!.days!;
  const n = Math.round(Number(days));
  const lead = Number.isFinite(n) && n > 0 ? Math.max(def.min, Math.min(def.max, n)) : def.value;
  return Math.max(0, Math.min(lead, prazos.garantia_dias - 1));
}
const NEW_CUSTOMER: Trigger = { type: "event", event: "customer.new" };

function clampDays(def: RuleDef, days: number | undefined): number {
  if (!def.days) return 0;
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n <= 0) return def.days.value;
  return Math.max(def.days.min, Math.min(def.days.max, n));
}

function textOf(def: RuleDef, message: string | undefined): string {
  const t = (message ?? "").trim();
  return (t || def.message || "").slice(0, 1000);
}

/** A automação que a regra liga. Ids de nó fixos: editar a mensagem não quebra quem já está no meio. */
export function buildRuleAutomation(key: RuleKey, opts: RuleOptions = {}): RuleAutomation {
  const def = ruleDef(key);
  const days = clampDays(def, opts.days);
  const text = textOf(def, opts.message);
  const base = {
    template_key: templateKeyFor(key),
    name: `Pós-venda: ${def.title}`,
    description: def.what,
    exit_rules: EXIT,
    guards: DEFAULT_GUARDS,
  };
  const send = (extra: Record<string, unknown> = {}): Omit<AutoNode, "position"> => ({
    id: "msg",
    type: "whatsapp",
    config: { text, category: "service", ...extra },
    next: "end",
  });
  const wait: Omit<AutoNode, "position"> = {
    id: "wait",
    type: "wait",
    config: { minutes: days * DAY },
    next: "msg",
  };

  switch (key) {
    case "boas_vindas":
      return {
        ...base,
        kind: "journey",
        trigger: NEW_CUSTOMER,
        reentry: "never",
        graph: chain([send(), END]),
      };
    case "checkin_7d":
      return {
        ...base,
        kind: "journey",
        trigger: NEW_CUSTOMER,
        reentry: "never",
        graph: chain([wait, send(), END]),
      };
    case "pesquisa":
      return {
        ...base,
        kind: "journey",
        trigger: NEW_CUSTOMER,
        reentry: "never",
        graph: chain([wait, send({ survey: "nps" }), END]),
      };
    case "recompra":
      return {
        ...base,
        kind: "journey",
        trigger: NEW_CUSTOMER,
        // comprou de novo (virou cliente outra vez): o lembrete recomeça
        reentry: "after_exit",
        graph: chain([wait, send(), END]),
      };
    case "nota_baixa_chamado":
      return {
        ...base,
        kind: "rule",
        trigger: { type: "event", event: "nps.answered", filters: { score_max: 6 } },
        reentry: "always",
        graph: chain([
          {
            id: "ticket",
            type: "ticket",
            config: {
              subject: "Nota baixa na pesquisa: {{nome}}",
              description: "O cliente deu nota baixa na pesquisa de satisfação. Fale com ele hoje.",
              priority: "high",
              include_survey: true,
            },
            next: "notify",
          },
          {
            id: "notify",
            type: "notify",
            config: {
              title: "{{nome}} deu nota baixa na pesquisa",
              body: "Um chamado foi aberto. Vale ligar ainda hoje.",
            },
            next: "end",
          },
          END,
        ]),
      };
    case "nota_alta_indicacao":
      return {
        ...base,
        kind: "rule",
        trigger: { type: "event", event: "nps.answered", filters: { score_min: 9 } },
        reentry: "always",
        graph: chain([send(), END]),
      };
    case "cliente_parado": {
      const stage = opts.atRiskStage ?? null;
      const task: Omit<AutoNode, "position"> = {
        id: "task",
        type: "task",
        config: {
          title: `Retomar contato com {{nome}} (${days} dias sem conversa)`,
          type: "whatsapp",
          due_in_minutes: DAY,
        },
        next: "end",
      };
      const tag: Omit<AutoNode, "position"> = {
        id: "tag",
        type: "add_tag",
        config: { tag: "em risco" },
        next: stage ? "stage" : "task",
      };
      const move: Omit<AutoNode, "position">[] = stage
        ? [
            {
              id: "stage",
              type: "move_stage",
              config: { stage_id: stage.id, stage_name: stage.name },
              next: "task",
            },
          ]
        : [];
      return {
        ...base,
        kind: "rule",
        trigger: { type: "inactive", days },
        // a varredura só traz de volta quem conversou de novo depois da última entrada
        reentry: "always",
        graph: chain([tag, ...move, task, END]),
      };
    }
    case "fim_arrependimento": {
      const prazos = opts.prazos ?? DEFAULT_PRAZOS;
      return {
        ...base,
        kind: "journey",
        // um dia antes de vencer: prazo de 7 dias, fala no 6º dia depois da compra
        trigger: afterPurchase(prazos.arrependimento_dias - 1),
        reentry: "after_exit",
        graph: chain([{ ...send(), next: "hold" }, HOLD, END]),
      };
    }
    case "fim_garantia": {
      const prazos = opts.prazos ?? DEFAULT_PRAZOS;
      const lead = garantiaLead(opts.days, prazos);
      return {
        ...base,
        kind: "journey",
        trigger: afterPurchase(prazos.garantia_dias - lead),
        reentry: "after_exit",
        graph: chain([{ ...send({ lead_days: lead }), next: "hold" }, HOLD, END]),
      };
    }
  }
}

/** Lê de volta, de uma automação salva, a mensagem e o prazo que o dono configurou. */
export function readRuleOptions(
  key: RuleKey,
  a: { trigger: Trigger; graph: Graph },
): { message: string | null; days: number | null } {
  const def = ruleDef(key);
  const msg = a.graph.nodes["msg"]?.config?.["text"];
  const waitMin = Number(a.graph.nodes["wait"]?.config?.["minutes"]);
  const days =
    key === "cliente_parado"
      ? Number(a.trigger.days)
      : key === "fim_garantia"
        ? Number(a.graph.nodes["msg"]?.config?.["lead_days"])
        : Number.isFinite(waitMin)
          ? waitMin / DAY
          : NaN;
  return {
    message:
      def.message === null ? null : typeof msg === "string" && msg.trim() ? msg : def.message,
    days: def.days ? (Number.isFinite(days) && days > 0 ? Math.round(days) : def.days.value) : null,
  };
}

/** Frase do "quando" com o prazo escolhido. */
export function whenText(def: RuleDef, days: number | null): string {
  return def.when.replace("{dias}", String(days ?? def.days?.value ?? ""));
}
