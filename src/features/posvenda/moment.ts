// Momento do cliente no ciclo de pós-venda: o "termômetro" que importa depois da venda.
// Conta pura (sem banco), usada pela tela, pelo Painel e pelo atendente de IA. Parte da data da
// última compra e dos prazos da conta e diz em que momento o cliente está: prazo de arrependimento,
// garantia, hora da recompra, renovação próxima ou risco de cancelamento.
//
// Onde os dados moram (nenhuma tabela nova):
//   contacts.custom.ultima_compra  "AAAA-MM-DD"  data da última compra (o gatilho por data do motor lê daqui)
//   contacts.custom.renovacao      "AAAA-MM-DD"  data de renovação do contrato (mesma chave do modelo "Renovação")
//   contacts.custom.avaliacoes     lista         registro manual de avaliações públicas (Google, Reclame Aqui)
//   accounts.settings.posvenda.prazos / .avaliacoes  prazos e links da empresa

export const PURCHASE_KEY = "ultima_compra";
export const RENEWAL_KEY = "renovacao";
export const REVIEWS_KEY = "avaliacoes";

// ------------------------------------------------------------------ datas (dia inteiro, fuso do Brasil)

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, "0");

// "en-CA" escreve AAAA-MM-DD; criado uma vez porque a conta roda para a carteira inteira
const BR_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Lê uma data digitada ou gravada ("2026-11-18", "18/11/2026", ISO com hora) e devolve "AAAA-MM-DD". */
export function isoDay(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const iso = ISO_DAY.exec(s.slice(0, 10));
  if (iso && (s.length === 10 || s[10] === "T" || s[10] === " ")) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return validYmd(y, m, d) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const br = BR_DAY.exec(s);
  if (br) {
    const [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
    return validYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  return null;
}

/** O dia de hoje no horário de Brasília (o dia vira à meia-noite daqui, não em UTC). */
export function todayIso(now: number | Date = Date.now()): string {
  return BR_DAY_FORMAT.format(now);
}

/** Um instante (ex.: quando virou cliente) no dia de Brasília. */
export function dayOfInstant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? todayIso(t) : null;
}

const dayNumber = (day: string) => {
  const m = ISO_DAY.exec(day)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
};

/** Dias inteiros de `from` até `to` (negativo se `to` já passou). */
export function daysBetween(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** "2026-11-18" → "18/11/2026". */
export function formatDay(day: string): string {
  const m = ISO_DAY.exec(day);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : day;
}

// ------------------------------------------------------------------ prazos da conta

export interface Prazos {
  /** Prazo de arrependimento, em dias (compras feitas fora da loja física). */
  arrependimento_dias: number;
  /** Garantia que a empresa dá, em dias. */
  garantia_dias: number;
  /** Com quantos dias de antecedência a renovação vira alerta. */
  renovacao_aviso_dias: number;
}

// O remix não copia dados: este padrão vale sem nenhuma linha gravada.
export const DEFAULT_PRAZOS: Prazos = {
  arrependimento_dias: 7,
  garantia_dias: 90,
  renovacao_aviso_dias: 30,
};

export const PRAZO_LIMITS: Record<keyof Prazos, { min: number; max: number }> = {
  arrependimento_dias: { min: 1, max: 60 },
  garantia_dias: { min: 1, max: 1825 },
  renovacao_aviso_dias: { min: 1, max: 180 },
};

const PRAZO_KEYS = Object.keys(DEFAULT_PRAZOS) as (keyof Prazos)[];

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function clampPrazo(key: keyof Prazos, raw: unknown): number {
  const n = Math.round(Number(raw));
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n) || n <= 0)
    return DEFAULT_PRAZOS[key];
  const { min, max } = PRAZO_LIMITS[key];
  return Math.max(min, Math.min(max, n));
}

/** Prazos da conta (accounts.settings.posvenda.prazos), com o padrão no que faltar. */
export function prazosOf(settings: unknown): Prazos {
  const raw = obj(obj(obj(settings)["posvenda"])["prazos"]);
  return {
    arrependimento_dias: clampPrazo("arrependimento_dias", raw["arrependimento_dias"]),
    garantia_dias: clampPrazo("garantia_dias", raw["garantia_dias"]),
    renovacao_aviso_dias: clampPrazo("renovacao_aviso_dias", raw["renovacao_aviso_dias"]),
  };
}

/** Novo settings com os prazos trocados, sem perder as outras chaves de posvenda nem do settings. */
export function withPrazos<T extends Record<string, unknown>>(
  settings: T,
  patch: Partial<Prazos>,
): T {
  const pv = obj(settings["posvenda"]);
  const cur = prazosOf(settings);
  const next = { ...cur };
  for (const k of PRAZO_KEYS) if (patch[k] !== undefined) next[k] = clampPrazo(k, patch[k]);
  return { ...settings, posvenda: { ...pv, prazos: next } };
}

// ------------------------------------------------------------------ links de avaliação da empresa

export interface AvaliacoesConfig {
  /** Link para o cliente avaliar a empresa no Google. */
  google_url: string;
  /** Link do perfil da empresa no Reclame Aqui. */
  reclame_aqui_url: string;
}

/** Só aceita endereço http(s); qualquer outra coisa vira vazio. */
export function cleanUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 500);
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".")
      ? u.toString()
      : "";
  } catch {
    return "";
  }
}

export function avaliacoesOf(settings: unknown): AvaliacoesConfig {
  const raw = obj(obj(obj(settings)["posvenda"])["avaliacoes"]);
  return {
    google_url: cleanUrl(raw["google_url"]),
    reclame_aqui_url: cleanUrl(raw["reclame_aqui_url"]),
  };
}

export function withAvaliacoes<T extends Record<string, unknown>>(
  settings: T,
  patch: Partial<AvaliacoesConfig>,
): T {
  const pv = obj(settings["posvenda"]);
  const cur = avaliacoesOf(settings);
  return {
    ...settings,
    posvenda: {
      ...pv,
      avaliacoes: {
        google_url: patch.google_url !== undefined ? cleanUrl(patch.google_url) : cur.google_url,
        reclame_aqui_url:
          patch.reclame_aqui_url !== undefined
            ? cleanUrl(patch.reclame_aqui_url)
            : cur.reclame_aqui_url,
      },
    },
  };
}

/** Variável {{link_avaliacao}} das mensagens: vira o link do Google ou some sem deixar buraco. */
export function fillReviewLink(text: string, googleUrl: string): string {
  const re = /\{\{\s*link_avaliacao\s*\}\}/gi;
  if (!re.test(text)) return text;
  return text
    .replace(re, googleUrl)
    .replace(/[ \t]+([.,;!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export const hasReviewLinkVar = (text: string) => /\{\{\s*link_avaliacao\s*\}\}/i.test(text);

// ------------------------------------------------------------------ datas do cliente (contacts.custom)

export function purchaseDateOf(custom: unknown): string | null {
  return isoDay(obj(custom)[PURCHASE_KEY]);
}

export function renewalDateOf(custom: unknown): string | null {
  return isoDay(obj(custom)[RENEWAL_KEY]);
}

/** Novo custom com a data trocada (ou removida, com null), sem perder os outros campos. */
export function withCustomDate(
  custom: unknown,
  key: typeof PURCHASE_KEY | typeof RENEWAL_KEY,
  day: string | null,
): Record<string, unknown> {
  const next = { ...obj(custom) };
  const clean = day === null ? null : isoDay(day);
  if (clean) next[key] = clean;
  else delete next[key];
  return next;
}

// ------------------------------------------------------------------ registro de avaliações públicas

export type ReviewKind = "pedido" | "google" | "reclame_aqui";
export type ComplaintStatus = "aberta" | "respondida" | "resolvida";

export interface ReviewEntry {
  id: string;
  kind: ReviewKind;
  /** Dia do registro, "AAAA-MM-DD". */
  at: string;
  /** Nota de 1 a 5 (avaliação no Google). */
  nota?: number;
  /** Situação da reclamação no Reclame Aqui. */
  status?: ComplaintStatus;
  obs?: string;
  /** "regra" quando o pedido saiu por uma regra de pós-venda; senão foi lançado à mão. */
  via?: "manual" | "regra";
}

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  pedido: "Pedimos avaliação",
  google: "Avaliou no Google",
  reclame_aqui: "Reclamou no Reclame Aqui",
};

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  aberta: "aberta",
  respondida: "respondida",
  resolvida: "resolvida",
};

const MAX_REVIEWS = 50;

function parseEntry(raw: unknown): ReviewEntry | null {
  const r = obj(raw);
  const kind = r["kind"];
  const at = isoDay(r["at"]);
  if ((kind !== "pedido" && kind !== "google" && kind !== "reclame_aqui") || !at) return null;
  const id = typeof r["id"] === "string" && r["id"] ? r["id"] : `${kind}-${at}`;
  const out: ReviewEntry = { id, kind, at };
  const nota = Math.round(Number(r["nota"]));
  if (kind === "google" && Number.isFinite(nota) && nota >= 1 && nota <= 5) out.nota = nota;
  if (kind === "reclame_aqui") {
    const st = r["status"];
    out.status = st === "respondida" || st === "resolvida" ? st : "aberta";
  }
  if (typeof r["obs"] === "string" && r["obs"].trim()) out.obs = r["obs"].trim().slice(0, 300);
  if (r["via"] === "regra") out.via = "regra";
  return out;
}

/** Registro de avaliações do cliente, do mais recente para o mais antigo. */
export function reviewsOf(custom: unknown): ReviewEntry[] {
  const raw = obj(custom)[REVIEWS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseEntry)
    .filter((e): e is ReviewEntry => e !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function withReview(custom: unknown, entry: ReviewEntry): Record<string, unknown> {
  const clean = parseEntry(entry);
  if (!clean) return obj(custom);
  const rest = reviewsOf(custom).filter((e) => e.id !== clean.id);
  return { ...obj(custom), [REVIEWS_KEY]: [clean, ...rest].slice(0, MAX_REVIEWS) };
}

export function withoutReview(custom: unknown, id: string): Record<string, unknown> {
  return { ...obj(custom), [REVIEWS_KEY]: reviewsOf(custom).filter((e) => e.id !== id) };
}

export function withComplaintStatus(
  custom: unknown,
  id: string,
  status: ComplaintStatus,
): Record<string, unknown> {
  return {
    ...obj(custom),
    [REVIEWS_KEY]: reviewsOf(custom).map((e) =>
      e.id === id && e.kind === "reclame_aqui" ? { ...e, status } : e,
    ),
  };
}

export const hasOpenComplaint = (entries: readonly ReviewEntry[]) =>
  entries.some((e) => e.kind === "reclame_aqui" && e.status === "aberta");

export function reviewLine(e: ReviewEntry): string {
  const when = formatDay(e.at);
  if (e.kind === "pedido") return `Pedimos avaliação em ${when}`;
  if (e.kind === "google")
    return `Avaliou no Google em ${when}${e.nota ? ` (nota ${e.nota} de 5)` : ""}`;
  return `Reclamou no Reclame Aqui em ${when} (${COMPLAINT_STATUS_LABEL[e.status ?? "aberta"]})`;
}

export interface ReviewsSummary {
  /** Pedidos de avaliação enviados (à mão ou por regra). */
  pedidos: number;
  /** Avaliações registradas no Google. */
  avaliacoes: number;
  /** Média das notas registradas, ou null sem nota. */
  media: number | null;
  /** Reclamações no Reclame Aqui ainda abertas. */
  reclamacoesAbertas: number;
  reclamacoes: number;
}

export function reviewsSummary(all: readonly (readonly ReviewEntry[])[]): ReviewsSummary {
  const sum: ReviewsSummary = {
    pedidos: 0,
    avaliacoes: 0,
    media: null,
    reclamacoesAbertas: 0,
    reclamacoes: 0,
  };
  let notas = 0;
  let total = 0;
  for (const entries of all)
    for (const e of entries) {
      if (e.kind === "pedido") sum.pedidos += 1;
      else if (e.kind === "google") {
        sum.avaliacoes += 1;
        if (e.nota) {
          notas += 1;
          total += e.nota;
        }
      } else {
        sum.reclamacoes += 1;
        if (e.status === "aberta") sum.reclamacoesAbertas += 1;
      }
    }
  sum.media = notas ? Math.round((total / notas) * 10) / 10 : null;
  return sum;
}

// ------------------------------------------------------------------ o momento

export type MomentKey =
  | "risco_cancelamento"
  | "arrependimento"
  | "renovacao"
  | "recompra"
  | "garantia"
  | "fora_garantia"
  | "sem_data";

/** Ordem do selo principal: o que mais ameaça a venda vem primeiro. */
export const MOMENT_PRIORITY: readonly MomentKey[] = [
  "risco_cancelamento",
  "arrependimento",
  "renovacao",
  "recompra",
  "garantia",
  "fora_garantia",
  "sem_data",
];

export const MOMENT_LABEL: Record<MomentKey, string> = {
  risco_cancelamento: "Risco de cancelamento",
  arrependimento: "Prazo de arrependimento",
  renovacao: "Renovação próxima",
  recompra: "Hora da recompra",
  garantia: "Em garantia",
  fora_garantia: "Fora da garantia",
  sem_data: "Sem data de compra",
};

/** Momentos que entram no filtro da lista e na contagem do Painel (sem_data fica só como aviso). */
export const MOMENT_FILTERS: readonly MomentKey[] = [
  "risco_cancelamento",
  "arrependimento",
  "renovacao",
  "recompra",
  "garantia",
  "fora_garantia",
];

export function isMomentKey(v: unknown): v is MomentKey {
  return typeof v === "string" && (MOMENT_PRIORITY as readonly string[]).includes(v);
}

export interface MomentConfig {
  prazos: Prazos;
  /** Ciclo de recompra em dias: o mesmo prazo da regra "Hora de comprar de novo". */
  recompraDias: number;
  /** Dias sem conversa que fazem um cliente "parado": o mesmo prazo da regra "Cliente parado". */
  paradoDias: number;
}

export const DEFAULT_RECOMPRA_DIAS = 30;
export const DEFAULT_PARADO_DIAS = 60;
/** A recompra aparece alguns dias antes do ciclo fechar. */
export const RECOMPRA_ANTECEDENCIA = 3;

export interface RiskSignals {
  /** Saúde do cliente (features/gestao/health.ts). */
  healthLevel?: "healthy" | "attention" | "risk" | null;
  npsLast?: number | null;
  /** Chamados abertos e chamados que estouraram o prazo. */
  openTickets?: number;
  breachedTickets?: number;
  /** Dias sem conversa (null = nunca conversou). */
  silentDays?: number | null;
  /** Reclamação aberta no Reclame Aqui (registro manual). */
  openComplaint?: boolean;
  /** A IA leu pedido de cancelamento na conversa (contacts.ai_intent). */
  cancelIntent?: boolean;
  /** Etiqueta "em risco" (a regra Cliente parado põe). */
  taggedAtRisk?: boolean;
}

export interface MomentInput {
  /** Data da compra informada (contacts.custom.ultima_compra). */
  purchaseDate: string | null;
  /** Quando virou cliente (sinais de saúde): usada quando não há data informada. */
  customerSince: string | null;
  /** Veio de importação: sem data informada, não dá para supor quando comprou. */
  imported?: boolean;
  /** Data de renovação informada ou prevista. */
  renewalDate: string | null;
  risk?: RiskSignals;
}

export interface MomentItem {
  key: MomentKey;
  label: string;
  /** Frase curta com o número que sustenta o selo. */
  detail: string;
}

export interface MomentResult {
  primary: MomentItem;
  secondary: MomentItem[];
  /** Todos os momentos em que o cliente está, na ordem de prioridade. */
  keys: MomentKey[];
  purchase: { date: string | null; estimated: boolean; daysSince: number | null };
  /** Prazo de arrependimento; null sem data de compra. */
  withdrawal: { active: boolean; day: number; of: number; endsOn: string } | null;
  warranty: { active: boolean; endsOn: string; daysLeft: number } | null;
  rebuy: { due: boolean; dueOn: string } | null;
  renewal: { date: string; inDays: number; soon: boolean } | null;
  riskReasons: string[];
}

const CANCEL_RE = /cancel|desist|encerrar (o )?(contrato|plano|assinatura)|quer sair|reembols/i;

/** A leitura da IA (contacts.ai_intent) fala em cancelar ou desistir? */
export function readsCancelIntent(aiIntent: string | null | undefined): boolean {
  return CANCEL_RE.test(aiIntent ?? "");
}

function riskReasons(r: RiskSignals | undefined, cfg: MomentConfig): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.openComplaint) out.push("Reclamação aberta no Reclame Aqui");
  if (r.cancelIntent) out.push("Falou em cancelar ou desistir na conversa");
  if (typeof r.npsLast === "number" && r.npsLast <= 6)
    out.push(`Deu nota ${r.npsLast} na pesquisa`);
  if ((r.breachedTickets ?? 0) > 0 && (r.openTickets ?? 0) > 0)
    out.push("Chamado aberto com prazo estourado");
  if (typeof r.silentDays === "number" && r.silentDays >= cfg.paradoDias)
    out.push(`Parado há ${r.silentDays} dias sem conversa`);
  else if (r.taggedAtRisk) out.push('Marcado com a etiqueta "em risco"');
  if (r.healthLevel === "risk" && out.length === 0) out.push("Saúde do cliente em risco");
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Em que momento do pós-venda o cliente está. Um cliente pode estar em mais de um (em garantia E
 * na hora da recompra): o selo principal segue MOMENT_PRIORITY e os demais vêm em `secondary`.
 */
export function computeMoment(
  input: MomentInput,
  cfg: MomentConfig,
  now: number | Date = Date.now(),
): MomentResult {
  const today = todayIso(now);
  const informed = isoDay(input.purchaseDate);
  const fallback = input.imported ? null : dayOfInstant(input.customerSince);
  const purchaseDate = informed ?? fallback;
  const estimated = !informed && purchaseDate !== null;
  // data no futuro (erro de digitação) conta como compra de hoje
  const daysSince = purchaseDate === null ? null : Math.max(0, daysBetween(purchaseDate, today));

  const items: MomentItem[] = [];
  const add = (key: MomentKey, detail: string) =>
    items.push({ key, label: MOMENT_LABEL[key], detail });

  const reasons = riskReasons(input.risk, cfg);
  if (reasons.length) add("risco_cancelamento", reasons[0]!);

  let withdrawal: MomentResult["withdrawal"] = null;
  let warranty: MomentResult["warranty"] = null;
  let rebuy: MomentResult["rebuy"] = null;

  if (purchaseDate !== null && daysSince !== null) {
    const n = cfg.prazos.arrependimento_dias;
    // O dia da compra não conta: comprou no dia 1, o prazo de 7 dias vai até o fim do dia 8.
    const wEnds = addDays(purchaseDate, n);
    withdrawal = { active: daysSince <= n, day: Math.max(1, daysSince), of: n, endsOn: wEnds };
    if (withdrawal.active)
      add(
        "arrependimento",
        daysSince === 0
          ? `Comprou hoje · prazo de ${n} dias vence em ${formatDay(wEnds)}`
          : daysSince === n
            ? `Dia ${n} de ${n} · vence hoje`
            : `Dia ${daysSince} de ${n} · vence em ${formatDay(wEnds)}`,
      );

    const g = cfg.prazos.garantia_dias;
    const gEnds = addDays(purchaseDate, g);
    warranty = { active: daysSince <= g, endsOn: gEnds, daysLeft: g - daysSince };

    const r = Math.max(1, cfg.recompraDias);
    const dueOn = addDays(purchaseDate, r);
    const due =
      daysSince >= Math.max(1, r - RECOMPRA_ANTECEDENCIA) && daysSince <= r + Math.max(r, 30);
    rebuy = { due, dueOn };
  }

  let renewal: MomentResult["renewal"] = null;
  const renewalDate = isoDay(input.renewalDate);
  if (renewalDate) {
    const inDays = daysBetween(today, renewalDate);
    // vencida há pouco ainda pede ação; muito antiga é dado velho
    const soon = inDays <= cfg.prazos.renovacao_aviso_dias && inDays >= -30;
    renewal = { date: renewalDate, inDays, soon };
    if (soon)
      add(
        "renovacao",
        inDays < 0
          ? `Renovação venceu há ${plural(-inDays, "dia", "dias")}`
          : inDays === 0
            ? "Renova hoje"
            : `Renova em ${plural(inDays, "dia", "dias")} (${formatDay(renewalDate)})`,
      );
  }

  if (rebuy?.due && daysSince !== null)
    add(
      "recompra",
      daysSince >= Math.max(1, cfg.recompraDias)
        ? `Comprou há ${plural(daysSince, "dia", "dias")}`
        : `Ciclo de ${cfg.recompraDias} dias fecha em ${formatDay(rebuy.dueOn)}`,
    );

  if (warranty)
    add(
      warranty.active ? "garantia" : "fora_garantia",
      warranty.active
        ? `Garantia até ${formatDay(warranty.endsOn)}`
        : `Garantia venceu em ${formatDay(warranty.endsOn)}`,
    );

  if (purchaseDate === null) add("sem_data", "Informe a data da compra na ficha do cliente");

  items.sort((a, b) => MOMENT_PRIORITY.indexOf(a.key) - MOMENT_PRIORITY.indexOf(b.key));
  return {
    primary: items[0]!,
    secondary: items.slice(1),
    keys: items.map((i) => i.key),
    purchase: { date: purchaseDate, estimated, daysSince },
    withdrawal,
    warranty,
    rebuy,
    renewal,
    riskReasons: reasons,
  };
}

// ------------------------------------------------------------------ contagem da carteira

export type MomentCounts = Record<MomentKey, number> & { total: number };

/** Quantos clientes em cada momento. Quem está em dois momentos conta nos dois. */
export function momentCounts(results: Iterable<MomentResult>): MomentCounts {
  const out = { total: 0 } as MomentCounts;
  for (const k of MOMENT_PRIORITY) out[k] = 0;
  for (const r of results) {
    out.total += 1;
    for (const k of r.keys) out[k] += 1;
  }
  return out;
}

// ------------------------------------------------------------------ o que o atendente de IA lê

/**
 * Linhas para a ficha do cliente que o atendente de IA recebe. Só fatos e datas: a política de
 * troca e devolução continua vindo do que a empresa ensinou ao atendente.
 */
export function momentContext(m: MomentResult, prazos: Prazos): string[] {
  if (m.purchase.date === null)
    return [
      "Momento no pós-venda: sem data de compra registrada. Não afirme prazo de arrependimento nem de garantia; pergunte a data da compra ou passe para a equipe.",
    ];
  const parts: string[] = [
    `comprou em ${formatDay(m.purchase.date)}${m.purchase.estimated ? " (data estimada: é quando virou cliente, confirme com ele se o prazo importar)" : ""}`,
  ];
  if (m.withdrawal)
    parts.push(
      m.withdrawal.active
        ? `está no dia ${m.withdrawal.day} de ${m.withdrawal.of} do prazo de arrependimento (vence em ${formatDay(m.withdrawal.endsOn)})`
        : `o prazo de arrependimento de ${prazos.arrependimento_dias} dias venceu em ${formatDay(m.withdrawal.endsOn)}`,
    );
  if (m.warranty)
    parts.push(
      m.warranty.active
        ? `garantia até ${formatDay(m.warranty.endsOn)}`
        : `garantia de ${prazos.garantia_dias} dias vencida em ${formatDay(m.warranty.endsOn)}`,
    );
  if (m.renewal && m.renewal.inDays >= -30)
    parts.push(
      m.renewal.inDays >= 0
        ? `renova em ${plural(m.renewal.inDays, "dia", "dias")} (${formatDay(m.renewal.date)})`
        : `renovação vencida em ${formatDay(m.renewal.date)}`,
    );
  if (m.rebuy?.due) parts.push("está na hora da recompra");
  const lines = [`Momento no pós-venda: ${parts.join("; ")}.`];
  if (m.riskReasons.length)
    lines.push(`Risco de cancelamento: ${m.riskReasons.join("; ")}. Atenda com cuidado redobrado.`);
  lines.push(
    "Use essas datas ao falar de troca, devolução e garantia. Não prometa nada fora desses prazos; na dúvida, passe para a equipe.",
  );
  return lines;
}
