// Totais da proposta, iguais aos do banco (public.proposal_totals): mensal conta 12 meses no total do 1º ano.
export interface ProposalItem {
  name: string;
  kind?: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  billing: "one_time" | "monthly" | "yearly";
  line_period: number;
  line_total: number;
}

export interface ProposalTotals {
  oneTime: number;
  monthly: number;
  yearly: number;
  discount: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function proposalTotals(items: ProposalItem[]): ProposalTotals {
  let oneTime = 0;
  let monthly = 0;
  let yearly = 0;
  let discount = 0;
  let total = 0;
  for (const i of items) {
    const period = Number(i.line_period);
    if (i.billing === "monthly") monthly += period;
    else if (i.billing === "yearly") yearly += period;
    else oneTime += period;
    discount +=
      Number(i.quantity) *
      Number(i.unit_price) *
      (Number(i.discount_pct) / 100) *
      (i.billing === "monthly" ? 12 : 1);
    total += Number(i.line_total);
  }
  return {
    oneTime: r2(oneTime),
    monthly: r2(monthly),
    yearly: r2(yearly),
    discount: r2(discount),
    total: r2(total),
  };
}

export function formatDocument(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return raw ?? "";
}

// CPF: dígitos verificadores (o CNPJ usa o validador de features/companies/cnpj).
export function isValidCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
