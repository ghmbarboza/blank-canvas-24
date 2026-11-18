// Agrupa chamados parecidos (muitos clientes reclamando da mesma coisa) para virar um incidente.
// Puro e explicável: palavras em comum no assunto e no começo da descrição.

export interface TicketLite {
  id: string;
  number: number;
  subject: string;
  description: string | null;
  created_at: string;
}

export interface TicketGroup {
  key: string;
  label: string;
  words: string[];
  tickets: TicketLite[];
}

const STOP = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem que e ou se nao não meu minha meus minhas seu sua seus suas esta este isso isto esse essa ja já mais muito pouco quando onde como qual quais ola olá oi bom boa dia tarde noite favor obrigado obrigada ajuda preciso problema hoje ainda tambem também estou está esta sobre ter tem tenho foi ser sendo fazer consigo consegui conseguindo".split(
    " ",
  ),
);

export function keywords(t: Pick<TicketLite, "subject" | "description">): string[] {
  const text = `${t.subject} ${t.subject} ${(t.description ?? "").slice(0, 200)}`;
  const words = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    // Radical simples: "boletos" e "boleto" contam igual.
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
  return [...new Set(words)];
}

export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  const inter = a.filter((w) => sb.has(w)).length;
  return inter / (a.length + b.length - inter);
}

/**
 * Agrupamento por ligação simples: dois chamados ficam juntos quando a semelhança passa do
 * limite. Só devolve grupos com pelo menos `minSize` chamados, do maior para o menor.
 */
export function groupSimilarTickets(
  tickets: TicketLite[],
  { threshold = 0.34, minSize = 3 }: { threshold?: number; minSize?: number } = {},
): TicketGroup[] {
  const kw = tickets.map((t) => keywords(t));
  const parent = tickets.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < tickets.length; i++)
    for (let j = i + 1; j < tickets.length; j++)
      if (similarity(kw[i]!, kw[j]!) >= threshold) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  tickets.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  const out: TicketGroup[] = [];
  for (const idx of groups.values()) {
    if (idx.length < minSize) continue;
    const freq = new Map<string, number>();
    for (const i of idx) for (const w of kw[i]!) freq.set(w, (freq.get(w) ?? 0) + 1);
    const words = [...freq.entries()]
      .filter(([, n]) => n >= Math.ceil(idx.length / 2))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([w]) => w);
    const list = idx
      .map((i) => tickets[i]!)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    out.push({
      key: list
        .map((t) => t.id)
        .sort()
        .join(","),
      label: list[0]!.subject,
      words,
      tickets: list,
    });
  }
  return out.sort((a, b) => b.tickets.length - a.tickets.length);
}
