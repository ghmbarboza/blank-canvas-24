// Termos monitorados: quais aparecem num texto (sem acento nem caixa, palavra inteira).
export interface TrackedTerm {
  id: string;
  term: string;
  category: string;
}

function fold(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Termos encontrados, com a contagem de ocorrências, na ordem do cadastro. */
export function findTerms(text: string, terms: TrackedTerm[]): (TrackedTerm & { hits: number })[] {
  const body = fold(text);
  return terms.flatMap((t) => {
    const needle = fold(t.term);
    if (needle.trim().length < 2) return [];
    const hits = body.split(needle).length - 1;
    return hits > 0 ? [{ ...t, hits }] : [];
  });
}
