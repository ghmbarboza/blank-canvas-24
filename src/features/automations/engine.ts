// Motor de automação: lógica pura (sem banco), usada pelo executor no servidor e pelo editor na tela.
// O grafo é um mapa de nós; cada nó aponta para o próximo (next) ou para dois ramos (yes/no).

export type NodeType =
  | "email"
  | "whatsapp"
  | "sms"
  | "voice_call"
  | "task"
  | "ticket"
  | "move_stage"
  | "assign"
  | "add_tag"
  | "remove_tag"
  | "set_field"
  | "ai_toggle"
  | "wait"
  | "wait_event"
  | "condition"
  | "ab_split"
  | "webhook"
  | "notify"
  | "ai_agent"
  | "composio_action"
  | "end";

export interface AutoNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
  next?: string | null;
  yes?: string | null;
  no?: string | null;
  position?: { x: number; y: number };
}

export interface Graph {
  start: string | null;
  nodes: Record<string, AutoNode>;
}

export type TriggerType = "manual" | "event" | "segment" | "no_reply" | "date" | "inactive";
export interface Trigger {
  type: TriggerType;
  event?: string;
  filters?: {
    form_id?: string;
    stage_id?: string;
    pipeline_id?: string;
    to?: string;
    channel?: string;
    /** Nota da pesquisa (evento nps.answered): só entra quem deu de score_min a score_max. */
    score_min?: number;
    score_max?: number;
  };
  segment_id?: string;
  hours?: number;
  field?: string;
  days_before?: number;
  /** Gatilho "inactive": cliente sem conversa há tantos dias. */
  days?: number;
}

export interface ExitRules {
  on_reply: boolean;
  on_meeting: boolean;
  on_customer: boolean;
  on_unsubscribe: boolean;
  on_deal_lost: boolean;
}

export interface BusinessHours {
  start: string; // "08:00"
  end: string; // "20:00"
  days: number[]; // 0 = domingo
}

export interface Guards {
  weekly_cap: number;
  business_hours: BusinessHours | null;
  respect_consent: boolean;
}

export const DEFAULT_EXIT: ExitRules = {
  on_reply: true,
  on_meeting: true,
  on_customer: true,
  on_unsubscribe: true,
  on_deal_lost: false,
};
export const DEFAULT_GUARDS: Guards = {
  weekly_cap: 3,
  business_hours: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] },
  respect_consent: true,
};

/** O que sabemos do contato no momento do passo (o executor monta a partir do banco). */
export interface Facts {
  replied_since_enroll: boolean;
  email_opened: boolean;
  email_clicked: boolean;
  meeting_scheduled: boolean;
  customer: boolean;
  unsubscribed: boolean;
  deal_lost: boolean;
  score: number | null;
  lifecycle: string | null;
  temperature: string | null;
  tags: string[];
  fields: Record<string, unknown>;
}

export const EMPTY_FACTS: Facts = {
  replied_since_enroll: false,
  email_opened: false,
  email_clicked: false,
  meeting_scheduled: false,
  customer: false,
  unsubscribed: false,
  deal_lost: false,
  score: null,
  lifecycle: null,
  temperature: null,
  tags: [],
  fields: {},
};

export const OUTREACH: NodeType[] = ["email", "whatsapp", "sms", "voice_call"];
export const CHANNEL_OF: Partial<Record<NodeType, "email" | "whatsapp" | "sms" | "voice">> = {
  email: "email",
  whatsapp: "whatsapp",
  sms: "sms",
  voice_call: "voice",
};
const BRANCHING: NodeType[] = ["condition", "wait_event", "ab_split"];

export const NODE_LABEL: Record<NodeType, string> = {
  email: "Enviar e-mail",
  whatsapp: "Enviar WhatsApp",
  sms: "Enviar SMS",
  voice_call: "Ligação da IA de voz",
  task: "Criar tarefa",
  ticket: "Abrir chamado",
  move_stage: "Mover no funil",
  assign: "Atribuir responsável",
  add_tag: "Adicionar etiqueta",
  remove_tag: "Remover etiqueta",
  set_field: "Preencher campo",
  ai_toggle: "Ligar/desligar IA da conversa",
  wait: "Esperar",
  wait_event: "Esperar até acontecer",
  condition: "Condição (se / senão)",
  ab_split: "Teste A/B",
  webhook: "Chamar webhook",
  notify: "Avisar a equipe",
  ai_agent: "Chamar agente de IA",
  composio_action: "Ação num app conectado",
  end: "Encerrar",
};

// ------------------------------------------------------------------ validação do grafo

export function validateGraph(g: Graph): string[] {
  const errors: string[] = [];
  const ids = Object.keys(g.nodes);
  if (ids.length === 0) return ["Adicione pelo menos um passo"];
  if (!g.start || !g.nodes[g.start]) errors.push("Defina o primeiro passo");
  for (const n of Object.values(g.nodes)) {
    const refs = [n.next, n.yes, n.no].filter((r): r is string => Boolean(r));
    for (const r of refs)
      if (!g.nodes[r]) errors.push(`"${NODE_LABEL[n.type]}" aponta para um passo que não existe`);
    if (BRANCHING.includes(n.type) && (!n.yes || !n.no))
      errors.push(`"${NODE_LABEL[n.type]}" precisa dos dois caminhos`);
    errors.push(...nodeConfigErrors(n));
  }
  // Ciclo sem espera vira laço infinito.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const dfs = (id: string, sinceWait: boolean): void => {
    if (done.has(id) && !visiting.has(id)) return;
    if (visiting.has(id)) {
      if (!sinceWait) errors.push("Há um ciclo sem passo de espera (laço infinito)");
      return;
    }
    visiting.add(id);
    const n = g.nodes[id];
    if (n) {
      const isWait = n.type === "wait" || n.type === "wait_event";
      for (const r of [n.next, n.yes, n.no]) if (r && g.nodes[r]) dfs(r, isWait || sinceWait);
    }
    visiting.delete(id);
    done.add(id);
  };
  if (g.start && g.nodes[g.start]) dfs(g.start, false);
  const reachable = reachableFrom(g);
  const orphans = ids.filter((id) => !reachable.has(id));
  if (orphans.length) errors.push(`${orphans.length} passo(s) solto(s), sem ligação com o início`);
  return [...new Set(errors)];
}

function reachableFrom(g: Graph): Set<string> {
  const seen = new Set<string>();
  const stack = g.start ? [g.start] : [];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !g.nodes[id]) continue;
    seen.add(id);
    const n = g.nodes[id]!;
    for (const r of [n.next, n.yes, n.no]) if (r) stack.push(r);
  }
  return seen;
}

export function nodeConfigErrors(n: AutoNode): string[] {
  const c = n.config ?? {};
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string).trim() : "");
  const label = NODE_LABEL[n.type];
  switch (n.type) {
    case "email":
      return !s("subject") || !s("body") ? [`${label}: falta assunto ou texto`] : [];
    case "whatsapp":
      return !s("text") && !s("template_name")
        ? [`${label}: escreva o texto ou escolha um template`]
        : [];
    case "sms":
      return !s("text") ? [`${label}: falta o texto`] : [];
    case "voice_call":
      return !s("voice_agent_id") ? [`${label}: escolha o agente de voz`] : [];
    case "task":
      return !s("title") ? [`${label}: falta o título`] : [];
    case "ticket":
      return !s("subject") ? [`${label}: falta o assunto`] : [];
    case "move_stage":
      return !s("stage_id") ? [`${label}: escolha a etapa`] : [];
    case "add_tag":
    case "remove_tag":
      return !s("tag") ? [`${label}: informe a etiqueta`] : [];
    case "set_field":
      return !s("field") ? [`${label}: escolha o campo`] : [];
    case "wait":
      return !(Number(c["minutes"]) > 0) ? [`${label}: informe quanto tempo`] : [];
    case "wait_event":
      return !s("event") || !(Number(c["timeout_minutes"]) > 0)
        ? [`${label}: escolha o evento e o prazo`]
        : [];
    case "webhook":
      return !/^https:\/\//.test(s("url")) ? [`${label}: use uma URL https://`] : [];
    case "notify":
      return !s("title") ? [`${label}: escreva o aviso`] : [];
    case "ai_agent":
      return !s("agent_id") ? [`${label}: escolha o agente`] : [];
    case "composio_action":
      return !/^[A-Z0-9_]{3,120}$/.test(s("tool_slug")) ? [`${label}: escolha a ação`] : [];
    default:
      return [];
  }
}

// ------------------------------------------------------------------ saída automática

export type ExitReason = "replied" | "meeting" | "customer" | "unsubscribed" | "deal_lost";

export function checkExit(rules: ExitRules, f: Facts): ExitReason | null {
  if (rules.on_unsubscribe && f.unsubscribed) return "unsubscribed";
  if (rules.on_customer && f.customer) return "customer";
  if (rules.on_meeting && f.meeting_scheduled) return "meeting";
  if (rules.on_reply && f.replied_since_enroll) return "replied";
  if (rules.on_deal_lost && f.deal_lost) return "deal_lost";
  return null;
}

export const EXIT_LABEL: Record<ExitReason, string> = {
  replied: "respondeu",
  meeting: "agendou reunião",
  customer: "virou cliente",
  unsubscribed: "descadastrou",
  deal_lost: "negócio perdido",
};

// ------------------------------------------------------------------ condição e A/B

export interface ConditionConfig {
  kind:
    | "opened"
    | "clicked"
    | "replied"
    | "score_gte"
    | "field_eq"
    | "lifecycle_eq"
    | "has_tag"
    | "temperature_eq"
    | "meeting";
  value?: string | number | null;
  key?: string;
}

export function evaluateCondition(c: ConditionConfig, f: Facts): boolean {
  switch (c.kind) {
    case "opened":
      return f.email_opened;
    case "clicked":
      return f.email_clicked;
    case "replied":
      return f.replied_since_enroll;
    case "meeting":
      return f.meeting_scheduled;
    case "score_gte":
      return (f.score ?? 0) >= Number(c.value ?? 0);
    case "lifecycle_eq":
      return f.lifecycle === c.value;
    case "temperature_eq":
      return f.temperature === c.value;
    case "has_tag":
      return f.tags.includes(String(c.value ?? ""));
    case "field_eq":
      return c.key ? String(f.fields[c.key] ?? "") === String(c.value ?? "") : false;
    default:
      return false;
  }
}

// Ramo A/B determinístico: o mesmo contato cai sempre no mesmo lado (repetir o passo não muda nada).
export function abBranch(runId: string, nodeId: string, percentA: number): "yes" | "no" {
  let h = 2166136261;
  for (const ch of `${runId}:${nodeId}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const bucket = (h >>> 0) % 100;
  return bucket < Math.max(0, Math.min(100, percentA)) ? "yes" : "no";
}

// ------------------------------------------------------------------ horário comercial no fuso

function localParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    min: Number(get("minute")),
    s: Number(get("second")),
    wd,
  };
}

// Diferença (ms) entre o relógio local no fuso e o UTC no instante dado.
function tzOffsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(at.getTime() / 1000) * 1000;
}

function hm(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Próximo instante permitido pela janela (o próprio `at` se já estiver dentro). */
export function nextAllowedTime(at: Date, tz: string, bh: BusinessHours | null): Date {
  if (!bh || bh.days.length === 0) return at;
  const start = hm(bh.start);
  const end = hm(bh.end);
  const p = localParts(at, tz);
  const minutes = p.h * 60 + p.min;
  if (bh.days.includes(p.wd) && minutes >= start && minutes < end) return at;
  // Procura o próximo dia (hoje inclusive, se ainda não abriu) e devolve a abertura em UTC.
  for (let i = 0; i < 8; i++) {
    const dayUtc = new Date(Date.UTC(p.y, p.m - 1, p.d + i, 12));
    const wd = dayUtc.getUTCDay();
    if (!bh.days.includes(wd)) continue;
    if (i === 0 && minutes >= start) continue;
    const localOpen = Date.UTC(
      dayUtc.getUTCFullYear(),
      dayUtc.getUTCMonth(),
      dayUtc.getUTCDate(),
      Math.floor(start / 60),
      start % 60,
    );
    const guess = new Date(localOpen - tzOffsetMs(new Date(localOpen), tz));
    return new Date(localOpen - tzOffsetMs(guess, tz));
  }
  return at;
}

/** Meia-noite do dia seguinte no fuso da conta (em UTC). */
export function startOfNextDay(at: Date, tz: string): Date {
  const p = localParts(at, tz);
  const local = Date.UTC(p.y, p.m - 1, p.d + 1, 0, 0, 0);
  const guess = new Date(local - tzOffsetMs(new Date(local), tz));
  return new Date(local - tzOffsetMs(guess, tz));
}

/** Meia-noite de hoje no fuso da conta (em UTC): de onde se conta o teto do dia. */
export function startOfDay(at: Date, tz: string): Date {
  const p = localParts(at, tz);
  const local = Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0);
  const guess = new Date(local - tzOffsetMs(new Date(local), tz));
  return new Date(local - tzOffsetMs(guess, tz));
}

/** Está no horário silencioso da conta (ex.: 21:00–08:00)? */
export function inQuietHours(at: Date, tz: string, start: string, end: string): boolean {
  const p = localParts(at, tz);
  const m = p.h * 60 + p.min;
  const s = hm(start);
  const e = hm(end);
  return s > e ? m >= s || m < e : m >= s && m < e;
}

export function quietHoursEnd(at: Date, tz: string, start: string, end: string): Date {
  if (!inQuietHours(at, tz, start, end)) return at;
  const days = [0, 1, 2, 3, 4, 5, 6];
  return nextAllowedTime(at, tz, { start: end, end: start > end ? start : "23:59", days });
}

// ------------------------------------------------------------------ planejamento de um passo

export interface StepContext {
  now: Date;
  tz: string;
  runId: string;
  guards: Guards;
  facts: Facts;
  sentThisWeek: number;
  consent: (channel: "email" | "whatsapp" | "sms" | "voice") => boolean;
  /** Contexto da inscrição (ex.: quando começou a esperar um evento). */
  runContext: Record<string, unknown>;
  /** Teto de WhatsApp automático por dia na conta inteira (0 ou ausente = sem teto). */
  dailyCap?: number;
  /** Quantos WhatsApp as automações da conta já mandaram hoje. */
  sentToday?: number;
}

export type StepAction =
  | {
      kind: "send";
      channel: "email" | "whatsapp" | "sms" | "voice";
      config: Record<string, unknown>;
    }
  | { kind: "task"; config: Record<string, unknown> }
  | { kind: "ticket"; config: Record<string, unknown> }
  | { kind: "move_stage"; stage_id: string }
  | { kind: "assign"; config: Record<string, unknown> }
  | { kind: "tag"; tag: string; add: boolean }
  | { kind: "set_field"; field: string; value: unknown }
  | { kind: "ai_toggle"; enabled: boolean }
  | { kind: "webhook"; url: string }
  | { kind: "notify"; config: Record<string, unknown> }
  | { kind: "ai_agent"; config: Record<string, unknown> }
  | { kind: "composio"; config: Record<string, unknown> };

export interface StepPlan {
  status: "advance" | "wait" | "done";
  action: StepAction | null;
  /** Próximo nó (advance/wait); null = terminou. */
  next: string | null;
  /** Quando executar o próximo passo. */
  at: Date;
  /** Mudanças no contexto da inscrição. */
  contextPatch: Record<string, unknown>;
  log: { status: "ok" | "skipped" | "deferred"; message: string };
}

export function planStep(node: AutoNode, ctx: StepContext): StepPlan {
  const c = node.config ?? {};
  const go = (
    next: string | null | undefined,
    action: StepAction | null,
    message: string,
    status: "ok" | "skipped" = "ok",
  ): StepPlan => ({
    status: next ? "advance" : "done",
    action,
    next: next ?? null,
    at: ctx.now,
    contextPatch: {},
    log: { status, message },
  });

  const channel = CHANNEL_OF[node.type];
  if (channel) {
    if (ctx.guards.respect_consent && !ctx.consent(channel))
      return go(node.next, null, `Pulado: sem consentimento ou bloqueado em ${channel}`, "skipped");
    if (ctx.guards.weekly_cap > 0 && ctx.sentThisWeek >= ctx.guards.weekly_cap)
      return go(
        node.next,
        null,
        `Pulado: teto de ${ctx.guards.weekly_cap} contatos na semana`,
        "skipped",
      );
    // Teto do dia (protege o número de WhatsApp): a mensagem não se perde, sai no dia seguinte.
    if (
      channel === "whatsapp" &&
      (ctx.dailyCap ?? 0) > 0 &&
      (ctx.sentToday ?? 0) >= ctx.dailyCap!
    ) {
      const tomorrow = startOfNextDay(ctx.now, ctx.tz);
      return {
        status: "wait",
        action: null,
        next: node.id,
        at: nextAllowedTime(tomorrow, ctx.tz, ctx.guards.business_hours),
        contextPatch: {},
        log: {
          status: "deferred",
          message: `Teto de ${ctx.dailyCap} mensagens por dia atingido: fica para amanhã`,
        },
      };
    }
    const allowed = nextAllowedTime(ctx.now, ctx.tz, ctx.guards.business_hours);
    if (allowed.getTime() > ctx.now.getTime()) {
      return {
        status: "wait",
        action: null,
        next: node.id,
        at: allowed,
        contextPatch: {},
        log: { status: "deferred", message: "Fora do horário comercial: reagendado" },
      };
    }
    return go(node.next, { kind: "send", channel, config: c }, `Enviado por ${channel}`);
  }

  switch (node.type) {
    case "task":
      return go(node.next, { kind: "task", config: c }, "Tarefa criada");
    case "ticket":
      return go(node.next, { kind: "ticket", config: c }, "Chamado aberto");
    case "move_stage":
      return go(
        node.next,
        { kind: "move_stage", stage_id: String(c["stage_id"] ?? "") },
        "Negócio movido",
      );
    case "assign":
      return go(node.next, { kind: "assign", config: c }, "Responsável atribuído");
    case "add_tag":
    case "remove_tag":
      return go(
        node.next,
        { kind: "tag", tag: String(c["tag"] ?? ""), add: node.type === "add_tag" },
        "Etiqueta atualizada",
      );
    case "set_field":
      return go(
        node.next,
        { kind: "set_field", field: String(c["field"] ?? ""), value: c["value"] ?? null },
        "Campo preenchido",
      );
    case "ai_toggle":
      return go(
        node.next,
        { kind: "ai_toggle", enabled: Boolean(c["enabled"]) },
        c["enabled"] ? "IA ligada" : "IA desligada",
      );
    case "webhook":
      return go(node.next, { kind: "webhook", url: String(c["url"] ?? "") }, "Webhook chamado");
    case "notify":
      return go(node.next, { kind: "notify", config: c }, "Equipe avisada");
    case "ai_agent":
      return go(node.next, { kind: "ai_agent", config: c }, "Agente de IA chamado");
    case "composio_action":
      return go(node.next, { kind: "composio", config: c }, "Ação executada no app");
    case "wait": {
      const minutes = Math.max(1, Number(c["minutes"] ?? 60));
      return {
        status: node.next ? "wait" : "done",
        action: null,
        next: node.next ?? null,
        at: new Date(ctx.now.getTime() + minutes * 60_000),
        contextPatch: {},
        log: { status: "ok", message: `Esperando ${formatMinutes(minutes)}` },
      };
    }
    case "wait_event": {
      const key = `wait_${node.id}`;
      const since = ctx.runContext[key] as string | undefined;
      const happened = evaluateCondition(
        { kind: String(c["event"] ?? "replied") as ConditionConfig["kind"] },
        ctx.facts,
      );
      if (happened)
        return {
          ...go(node.yes, null, "Aconteceu: seguiu pelo caminho do sim"),
          contextPatch: { [key]: null },
        };
      const timeout = Math.max(1, Number(c["timeout_minutes"] ?? 1440));
      if (!since) {
        return {
          status: "wait",
          action: null,
          next: node.id,
          at: new Date(ctx.now.getTime() + timeout * 60_000),
          contextPatch: { [key]: ctx.now.toISOString() },
          log: { status: "ok", message: `Aguardando até ${formatMinutes(timeout)}` },
        };
      }
      const deadline = new Date(since).getTime() + timeout * 60_000;
      if (ctx.now.getTime() >= deadline)
        return {
          ...go(node.no, null, "Prazo acabou: seguiu pelo caminho do não"),
          contextPatch: { [key]: null },
        };
      return {
        status: "wait",
        action: null,
        next: node.id,
        at: new Date(deadline),
        contextPatch: {},
        log: { status: "ok", message: "Ainda aguardando" },
      };
    }
    case "condition": {
      const yes = evaluateCondition(c as unknown as ConditionConfig, ctx.facts);
      return go(yes ? node.yes : node.no, null, yes ? "Condição verdadeira" : "Condição falsa");
    }
    case "ab_split": {
      const side = abBranch(ctx.runId, node.id, Number(c["percent_a"] ?? 50));
      return {
        ...go(side === "yes" ? node.yes : node.no, null, side === "yes" ? "Grupo A" : "Grupo B"),
        contextPatch: { [`ab_${node.id}`]: side === "yes" ? "A" : "B" },
      };
    }
    case "end":
      return go(null, null, "Encerrado");
    default:
      return go(node.next, null, "Passo desconhecido ignorado", "skipped");
  }
}

export function formatMinutes(m: number): string {
  if (m % 1440 === 0) return `${m / 1440} dia${m === 1440 ? "" : "s"}`;
  if (m % 60 === 0) return `${m / 60} hora${m === 60 ? "" : "s"}`;
  return `${m} min`;
}

/** Idempotência: o job carrega o step_seq que o criou; se a inscrição já andou, o job é velho. */
export function isStaleStep(
  jobSeq: number | undefined,
  runSeq: number,
  runStatus: string,
): boolean {
  if (!["running", "waiting"].includes(runStatus)) return true;
  return jobSeq !== undefined && jobSeq !== runSeq;
}

/** O gatilho de evento casa com este evento? (com filtros por formulário, etapa, canal) */
export function triggerMatches(
  t: Trigger,
  ev: { type: string; payload: Record<string, unknown> },
): boolean {
  if (t.type !== "event" || t.event !== ev.type) return false;
  const f = t.filters ?? {};
  if (f.form_id && ev.payload["form_id"] !== f.form_id) return false;
  if (f.stage_id && ev.payload["to"] !== f.stage_id) return false;
  if (f.to && ev.payload["to"] !== f.to) return false;
  if (f.score_min !== undefined || f.score_max !== undefined) {
    const score = Number(ev.payload["score"]);
    if (!Number.isFinite(score) || ev.payload["score"] === null) return false;
    if (f.score_min !== undefined && score < f.score_min) return false;
    if (f.score_max !== undefined && score > f.score_max) return false;
  }
  return true;
}

let counter = 0;
export function newNodeId(): string {
  counter += 1;
  return `n${Date.now().toString(36)}${counter.toString(36)}`;
}
