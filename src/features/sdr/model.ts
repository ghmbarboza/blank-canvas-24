// Pontuação preditiva do lead: regressão logística simples treinada nos negócios ganhos e perdidos
// da própria conta. Explicável: cada nota mostra os 3 fatores que mais pesaram. Puro (sem rede).

export interface LeadFeatureRow {
  contact_id: string;
  label: number | null;
  source: string | null;
  has_email: boolean | null;
  has_phone: boolean | null;
  has_company: boolean | null;
  company_size: string | null;
  industry: string | null;
  platform: string | null;
  inbound: number | null;
  outbound: number | null;
  meetings: number | null;
  forms: number | null;
  temperature: string | null;
  age_days: number | null;
}

export type FeatureVector = Record<string, number>;

export interface LeadModel {
  bias: number;
  weights: Record<string, number>;
  /** Média de cada atributo no treino: a explicação compara o lead com o lead típico. */
  means: Record<string, number>;
  labels: Record<string, string>;
}

export interface Factor {
  key: string;
  label: string;
  impact: number;
  direction: "up" | "down";
}

function cat(prefix: string, value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return v ? `${prefix}:${v.slice(0, 40)}` : null;
}

const NUM_LABEL: Record<string, string> = {
  has_email: "Tem e-mail",
  has_phone: "Tem telefone",
  has_company: "Ligado a uma empresa",
  inbound: "Mensagens que mandou",
  replied: "Respondeu as mensagens",
  meetings: "Reuniões marcadas",
  forms: "Formulários enviados",
  age: "Tempo como lead",
};

const PREFIX_LABEL: Record<string, string> = {
  source: "Origem",
  size: "Porte da empresa",
  industry: "Segmento",
  platform: "Canal",
  temp: "Temperatura",
};

const TEMP_LABEL: Record<string, string> = { hot: "quente", warm: "morno", cold: "frio" };

export function featureLabel(key: string): string {
  if (NUM_LABEL[key]) return NUM_LABEL[key]!;
  const [p, v] = key.split(":");
  const val = p === "temp" ? (TEMP_LABEL[v ?? ""] ?? v) : v;
  return `${PREFIX_LABEL[p ?? ""] ?? p}: ${val}`;
}

/** Linha do banco → atributos numéricos (contagens em log para não explodir a escala). */
export function featurize(r: LeadFeatureRow): FeatureVector {
  const x: FeatureVector = {
    has_email: r.has_email ? 1 : 0,
    has_phone: r.has_phone ? 1 : 0,
    has_company: r.has_company ? 1 : 0,
    inbound: Math.log1p(Math.max(0, r.inbound ?? 0)),
    replied: (r.inbound ?? 0) > 0 && (r.outbound ?? 0) > 0 ? 1 : 0,
    meetings: Math.log1p(Math.max(0, r.meetings ?? 0)),
    forms: Math.log1p(Math.max(0, r.forms ?? 0)),
    age: Math.log1p(Math.max(0, r.age_days ?? 0)) / 3,
  };
  for (const k of [
    cat("source", r.source),
    cat("size", r.company_size),
    cat("industry", r.industry),
    cat("platform", r.platform),
    cat("temp", r.temperature),
  ])
    if (k) x[k] = 1;
  return x;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function dot(w: Record<string, number>, x: FeatureVector): number {
  let s = 0;
  for (const [k, v] of Object.entries(x)) s += (w[k] ?? 0) * v;
  return s;
}

export const MIN_SAMPLES = 20;
export const MIN_PER_CLASS = 5;

export function canTrain(rows: Pick<LeadFeatureRow, "label">[]): { ok: boolean; reason: string } {
  const pos = rows.filter((r) => r.label === 1).length;
  const neg = rows.filter((r) => r.label === 0).length;
  if (pos + neg < MIN_SAMPLES)
    return {
      ok: false,
      reason: `Precisa de pelo menos ${MIN_SAMPLES} negócios fechados (ganhos ou perdidos); há ${pos + neg}.`,
    };
  if (pos < MIN_PER_CLASS || neg < MIN_PER_CLASS)
    return {
      ok: false,
      reason: `Precisa de pelo menos ${MIN_PER_CLASS} ganhos e ${MIN_PER_CLASS} perdidos; há ${pos} e ${neg}.`,
    };
  return { ok: true, reason: "" };
}

/**
 * Gradiente descendente com regularização L2. Atributo categórico raro (menos de 3 leads) é
 * descartado: não dá para aprender com um caso só.
 */
export function train(
  rows: LeadFeatureRow[],
  { epochs = 300, rate = 0.3, l2 = 0.01 }: { epochs?: number; rate?: number; l2?: number } = {},
): { model: LeadModel; accuracy: number; samples: number; positives: number } {
  const data = rows
    .filter((r) => r.label === 0 || r.label === 1)
    .map((r) => ({ x: featurize(r), y: r.label as number }));
  const freq = new Map<string, number>();
  for (const d of data) for (const k of Object.keys(d.x)) freq.set(k, (freq.get(k) ?? 0) + 1);
  const keys = [...freq.entries()].filter(([k, n]) => !k.includes(":") || n >= 3).map(([k]) => k);
  const keep = new Set(keys);
  const xs = data.map((d) => ({
    x: Object.fromEntries(Object.entries(d.x).filter(([k]) => keep.has(k))),
    y: d.y,
  }));
  const means: Record<string, number> = {};
  for (const k of keys)
    means[k] = xs.reduce((s, d) => s + (d.x[k] ?? 0), 0) / Math.max(1, xs.length);
  const w: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const pos = xs.filter((d) => d.y === 1).length;
  let b = Math.log((pos + 1) / (xs.length - pos + 1));
  const n = Math.max(1, xs.length);
  for (let e = 0; e < epochs; e++) {
    const grad: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    let gb = 0;
    for (const d of xs) {
      const err = sigmoid(b + dot(w, d.x)) - d.y;
      gb += err;
      for (const [k, v] of Object.entries(d.x)) grad[k] = (grad[k] ?? 0) + err * v;
    }
    b -= (rate * gb) / n;
    for (const k of keys) w[k] = (w[k] ?? 0) - rate * ((grad[k] ?? 0) / n + l2 * (w[k] ?? 0));
  }
  const labels = Object.fromEntries(keys.map((k) => [k, featureLabel(k)]));
  const model: LeadModel = { bias: b, weights: w, means, labels };
  const hits = xs.filter((d) => (sigmoid(b + dot(w, d.x)) >= 0.5 ? 1 : 0) === d.y).length;
  return { model, accuracy: xs.length ? hits / xs.length : 0, samples: xs.length, positives: pos };
}

/** Nota de 0 a 100 e os 3 fatores que mais afastam este lead do lead típico. */
export function predict(
  model: LeadModel,
  row: LeadFeatureRow,
): { score: number; factors: Factor[] } {
  const x = featurize(row);
  const z = model.bias + dot(model.weights, x);
  const contribs: Factor[] = [];
  const keys = new Set([...Object.keys(model.weights)]);
  for (const k of keys) {
    const w = model.weights[k] ?? 0;
    const impact = w * ((x[k] ?? 0) - (model.means[k] ?? 0));
    if (Math.abs(impact) < 0.01) continue;
    contribs.push({
      key: k,
      label: model.labels[k] ?? featureLabel(k),
      impact: Math.round(impact * 100) / 100,
      direction: impact > 0 ? "up" : "down",
    });
  }
  contribs.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  return { score: Math.round(sigmoid(z) * 100), factors: contribs.slice(0, 3) };
}

export interface ReplySlot {
  hour: number;
  dow: number;
  n: number;
}

/**
 * Horário ideal aprendido pelas respostas: a hora com mais respostas (somando a vizinha, porque
 * quem responde às 10h costuma responder às 11h). Com menos de 3 respostas, não há o que aprender.
 */
export function bestHour(
  slots: ReplySlot[],
): { hour: number; dow: number | null; samples: number } | null {
  const total = slots.reduce((s, x) => s + x.n, 0);
  if (total < 3) return null;
  const byHour = new Array<number>(24).fill(0);
  const byDow = new Array<number>(7).fill(0);
  for (const s of slots) {
    byHour[s.hour] = (byHour[s.hour] ?? 0) + s.n;
    byDow[s.dow] = (byDow[s.dow] ?? 0) + s.n;
  }
  let best = 0;
  let bestScore = -1;
  for (let h = 0; h < 24; h++) {
    const sc = byHour[h]! * 2 + (byHour[(h + 23) % 24] ?? 0) + (byHour[(h + 1) % 24] ?? 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = h;
    }
  }
  const maxDow = Math.max(...byDow);
  const dow = maxDow >= Math.max(2, total * 0.4) ? byDow.indexOf(maxDow) : null;
  return { hour: best, dow, samples: total };
}

export const DOW_LABEL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
