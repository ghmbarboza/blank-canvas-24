import { describe, expect, it } from "vitest";

import { describeResendDomains } from "./resend-domains";

const domains = [
  { name: "mail.empresa.com.br", status: "verified" },
  { name: "outra-marca.com", status: "verified" },
  { name: "novo.empresa.com.br", status: "pending" },
];

describe("describeResendDomains", () => {
  it("confirma o domínio do remetente sem citar os outros", () => {
    const msg = describeResendDomains(domains, "contato@mail.empresa.com.br");
    expect(msg).toContain("mail.empresa.com.br está verificado");
    expect(msg).not.toContain("outra-marca.com");
  });

  it("avisa quando o domínio do remetente está pendente", () => {
    expect(describeResendDomains(domains, "a@novo.empresa.com.br")).toContain("status: pending");
  });

  it("avisa quando o domínio do remetente não existe na conta", () => {
    expect(describeResendDomains(domains, "a@empresa.com.br")).toContain("não está cadastrado");
  });

  it("sem remetente, pede para informar e não lista domínios", () => {
    const msg = describeResendDomains(domains);
    expect(msg).toContain("Falta informar o remetente");
    expect(msg).not.toContain("outra-marca.com");
  });

  it("sem domínio verificado, diz isso", () => {
    expect(describeResendDomains([])).toContain("nenhum domínio verificado");
  });
});
