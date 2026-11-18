// Quem está fora do ar: cada serviço manda sinal de vida (service_heartbeats); passou do limite
// sem sinal em NENHUMA instância, está fora. A mesma regra roda no banco em
// public.check_service_heartbeats() (migration 20261022224000), que é quem abre o alerta.

export const DOWN_AFTER_MS = 3 * 60_000;

/** Serviços que mandam sinal hoje. */
export const SERVICES = {
  APP_CRON: "app-cron",
  LIVECOACH_WORKER: "livecoach-worker",
} as const;

/**
 * Serviços sob demanda: o LiveKit Cloud põe o worker para dormir sem reunião e acorda quando
 * uma sala abre. Sem sinal e sem reunião acontecendo = dormindo (normal); só é "fora" quando há
 * reunião ao vivo e o worker não dá sinal.
 */
export const ON_DEMAND: ReadonlySet<string> = new Set([SERVICES.LIVECOACH_WORKER]);

export interface HeartbeatRow {
  service: string;
  instance: string;
  last_seen: string;
}

export interface ServiceStatus {
  service: string;
  last_seen: string | null;
  age_s: number | null;
  instances: number;
  down: boolean;
  sleeping: boolean;
}

export function serviceStatuses(
  rows: readonly HeartbeatRow[],
  now: number = Date.now(),
  downAfterMs: number = DOWN_AFTER_MS,
  inDemand: ReadonlySet<string> = new Set(),
  expected: ReadonlySet<string> = new Set(),
): ServiceStatus[] {
  const byService = new Map<string, { last: number; instances: number }>();
  for (const r of rows) {
    const t = Date.parse(r.last_seen);
    if (!Number.isFinite(t)) continue;
    const cur = byService.get(r.service);
    byService.set(r.service, {
      last: cur ? Math.max(cur.last, t) : t,
      instances: (cur?.instances ?? 0) + 1,
    });
  }
  for (const service of expected) {
    if (!byService.has(service)) byService.set(service, { last: Number.NaN, instances: 0 });
  }
  return [...byService.entries()]
    .map(([service, v]) => {
      const missing = !Number.isFinite(v.last);
      const stale = missing || now - v.last > downAfterMs;
      const sleeping = stale && ON_DEMAND.has(service) && !inDemand.has(service);
      return {
        service,
        last_seen: missing ? null : new Date(v.last).toISOString(),
        age_s: missing ? null : Math.max(0, Math.round((now - v.last) / 1000)),
        instances: v.instances,
        down: stale && !sleeping,
        sleeping,
      };
    })
    .sort((a, b) => a.service.localeCompare(b.service));
}

export function downServices(statuses: readonly ServiceStatus[]): string[] {
  return statuses.filter((s) => s.down).map((s) => s.service);
}

/** Metadados do sinal: até 20 chaves com valor simples (texto curto, número, verdadeiro/falso). */
export function cleanMeta(v: unknown): Record<string, string | number | boolean> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 20)) {
    const key = k.replace(/[^\w.-]/g, "").slice(0, 40);
    if (!key) continue;
    if (typeof val === "string") out[key] = val.slice(0, 200);
    else if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
    else if (typeof val === "boolean") out[key] = val;
  }
  return out;
}

/** Nome de instância aceito pelo banco (1 a 120 caracteres, sem controle). */
export function cleanInstance(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/[^\w.:@-]/g, "").slice(0, 120) : "";
  return s || "default";
}
