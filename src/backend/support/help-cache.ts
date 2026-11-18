// Cache curto da busca da central de ajuda pública (R9): a mesma pergunta na mesma conta não gera outro
// embedding por 10 minutos. Por isolate, com teto de entradas (o mais antigo sai primeiro).
const TTL_MS = 10 * 60_000;
const MAX = 500;
const store = new Map<string, { at: number; value: unknown[] }>();

export function helpCacheKey(accountId: string, q: string): string {
  return `${accountId}:${q.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export function helpCacheGet<T = unknown>(key: string, now = Date.now()): T[] | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (now - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value as T[];
}

export function helpCacheSet(key: string, value: unknown[], now = Date.now()) {
  if (store.size >= MAX) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { at: now, value });
}
