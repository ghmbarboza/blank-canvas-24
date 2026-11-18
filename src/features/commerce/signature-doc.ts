// Documento da proposta para assinatura eletrônica (markdown aceito pela ZapSign).
import type { ProposalItem } from "./totals";

export interface SignatureProposal {
  number: number;
  version: number;
  title: string;
  company: string;
  client: string;
  items: ProposalItem[];
  one_time_total: number;
  monthly_total: number;
  yearly_total: number;
  discount_total: number;
  total: number;
  valid_until: string | null;
  conditions: string | null;
}

// contrato mostra centavos (o formatMoney da tela arredonda para reais)
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatMoney = (n: number | string) => BRL.format(Number(n) || 0);

const BILLING: Record<ProposalItem["billing"], string> = {
  one_time: "único",
  monthly: "mensal",
  yearly: "anual",
};

// texto livre do vendedor não pode virar markdown estrutural (tabela, título) no documento
function clean(s: string): string {
  return s
    .replace(/[|#*_`>[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function proposalMarkdown(p: SignatureProposal): string {
  const rows = p.items.map(
    (i) =>
      `| ${clean(i.name)} | ${Number(i.quantity)} | ${formatMoney(i.unit_price)} | ${BILLING[i.billing]} | ${Number(i.discount_pct) ? `${Number(i.discount_pct)}%` : "—"} | ${formatMoney(i.line_period)} |`,
  );
  const totals = [
    p.one_time_total ? `- Valor único: **${formatMoney(p.one_time_total)}**` : null,
    p.monthly_total ? `- Mensalidade: **${formatMoney(p.monthly_total)}**` : null,
    p.yearly_total ? `- Anuidade: **${formatMoney(p.yearly_total)}**` : null,
    p.discount_total ? `- Descontos no 1º ano: ${formatMoney(p.discount_total)}` : null,
    `- Total do 1º ano: **${formatMoney(p.total)}**`,
  ].filter(Boolean);
  return [
    `# Proposta nº ${p.number}${p.version > 1 ? ` (versão ${p.version})` : ""}: ${clean(p.title)}`,
    "",
    `**Contratada:** ${clean(p.company)}  `,
    `**Contratante:** ${clean(p.client)}`,
    "",
    "## Itens",
    "",
    "| Item | Qtd. | Preço | Cobrança | Desconto | Valor |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Valores",
    "",
    ...totals,
    "",
    ...(p.conditions ? ["## Condições", "", clean(p.conditions), ""] : []),
    ...(p.valid_until
      ? [
          `Proposta válida até ${new Date(`${p.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}.`,
          "",
        ]
      : []),
    "Ao assinar, a Contratante aceita os itens, valores e condições acima.",
  ].join("\n");
}
