import { describe, expect, it } from "vitest";

import { proposalMarkdown, type SignatureProposal } from "./signature-doc";

const BASE: SignatureProposal = {
  number: 42,
  version: 1,
  title: "Plano Equipe",
  company: "ACME",
  client: "Empresa A",
  items: [
    {
      name: "Plano Equipe",
      quantity: 8,
      unit_price: 99,
      discount_pct: 10,
      billing: "monthly",
      line_period: 712.8,
      line_total: 8553.6,
    },
  ],
  one_time_total: 0,
  monthly_total: 712.8,
  yearly_total: 0,
  discount_total: 950.4,
  total: 8553.6,
  valid_until: "2026-11-30",
  conditions: "Pagamento até o dia 5.",
};

describe("proposalMarkdown", () => {
  it("traz número, partes, item, totais e validade", () => {
    const md = proposalMarkdown(BASE);
    expect(md).toContain("# Proposta nº 42: Plano Equipe");
    expect(md).toContain("**Contratante:** Empresa A");
    expect(md).toMatch(/\| Plano Equipe \| 8 \| .*99,00 \| mensal \| 10% \| .*712,80 \|/);
    expect(md).toContain("Total do 1º ano");
    expect(md).toContain("30/11/2026");
    expect(md).toContain("Pagamento até o dia 5.");
  });

  it("omite linhas de total zeradas e mostra versão quando > 1", () => {
    const md = proposalMarkdown({ ...BASE, version: 2 });
    expect(md).toContain("(versão 2)");
    expect(md).not.toContain("Valor único");
    expect(md).not.toContain("Anuidade");
  });

  it("neutraliza markdown estrutural vindo de texto livre", () => {
    const md = proposalMarkdown({
      ...BASE,
      client: "# Hack | tabela",
      conditions: "**negrito** e `código`",
    });
    expect(md).toContain("**Contratante:** Hack tabela");
    expect(md).not.toContain("# Hack");
    expect(md).toContain("negrito e código");
  });
});
