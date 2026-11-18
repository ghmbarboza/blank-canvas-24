import { describe, expect, it } from "vitest";

import { isAutomatedEmail } from "./auto-reply";

describe("e-mail de robô não recebe resposta da IA", () => {
  it("remetente que não lê resposta", () => {
    expect(isAutomatedEmail("no-reply@banco.com", "Sua fatura")).toBe(true);
    expect(isAutomatedEmail("noreply+123@x.com", "")).toBe(true);
    expect(isAutomatedEmail("MAILER-DAEMON@mx.google.com", "x")).toBe(true);
  });
  it("aviso de ausência e devolução", () => {
    expect(isAutomatedEmail("ana@empresa.com", "Resposta automática: férias")).toBe(true);
    expect(isAutomatedEmail("ana@empresa.com", "Out of office")).toBe(true);
    expect(isAutomatedEmail("ana@empresa.com", "Undeliverable: proposta")).toBe(true);
  });
  it("cliente de verdade passa", () => {
    expect(isAutomatedEmail("joao.reply@gmail.com", "Dúvida sobre o plano")).toBe(false);
    expect(isAutomatedEmail("ana@empresa.com", "Re: orçamento")).toBe(false);
  });
});
