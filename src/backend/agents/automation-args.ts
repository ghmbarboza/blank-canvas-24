// Argumentos da ação num app conectado, na automação: JSON do gestor com {{variáveis}}.
/** Preenche {{variáveis}} em todos os textos de um objeto de argumentos (sem mexer na estrutura). */
export function fillDeep(v: unknown, fill: (s: string) => string, depth = 0): unknown {
  if (depth > 6) return v;
  if (typeof v === "string") return fill(v);
  if (Array.isArray(v)) return v.map((x) => fillDeep(x, fill, depth + 1));
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, fill, depth + 1)]));
  return v;
}

export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    /* cai no erro abaixo */
  }
  throw new Error("Os campos da ação não estão em JSON válido");
}
