import { describe, expect, it } from "vitest";

import { MASK, isLuhn, isValidCpf, maskSensitive, maskText } from "./mask-sensitive";

describe("maskSensitive", () => {
  it("mascara CPF válido formatado e colado", () => {
    const r = maskSensitive("Meu CPF é 529.982.247-25 e o da minha mãe 52998224725.");
    expect(r.text).toBe(`Meu CPF é ${MASK.cpf} e o da minha mãe ${MASK.cpf}.`);
    expect(r.counts.cpf).toBe(2);
  });

  it("não mascara número de 11 dígitos que não é CPF (ex.: telefone)", () => {
    expect(maskText("Liga no 11987654321")).toBe("Liga no 11987654321");
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("mascara cartão com Luhn válido, com e sem espaços", () => {
    const r = maskSensitive("cartão 4111 1111 1111 1111, outro 5500-0000-0000-0004");
    expect(r.text).toBe(`cartão ${MASK.card}, outro ${MASK.card}`);
    expect(r.counts.card).toBe(2);
  });

  it("deixa sequência longa que não passa no Luhn (ex.: protocolo)", () => {
    expect(isLuhn("1234567890123456")).toBe(false);
    expect(maskText("protocolo 1234567890123456")).toBe("protocolo 1234567890123456");
  });

  it("mascara senha, PIN e CVV mantendo o rótulo", () => {
    expect(maskText("minha senha é abc@123")).toBe(`minha senha é ${MASK.secret}`);
    expect(maskText("Senha: Xpto9!")).toBe(`Senha: ${MASK.secret}`);
    expect(maskText("password=hunter2 ok")).toBe(`password=${MASK.secret} ok`);
    expect(maskText("o cvv 123")).toBe(`o cvv ${MASK.secret}`);
    expect(maskText('senha "frase com espaço"')).toBe(`senha ${MASK.secret}`);
    expect(maskText("E a senha do app é abc@123 se precisar")).toBe(
      `E a senha do app é ${MASK.secret} se precisar`,
    );
    expect(maskText("a senha está errada")).toBe("a senha está errada");
  });

  it("não confunde palavra comum depois do rótulo sem separador", () => {
    expect(maskText("o pin de localização")).toBe("o pin de localização");
    expect(maskText("esqueci a senha e preciso de ajuda")).toBe(
      "esqueci a senha e preciso de ajuda",
    );
  });

  it("aceita vazio e nulo", () => {
    expect(maskText(null)).toBe("");
    expect(maskSensitive("").counts).toEqual({ cpf: 0, card: 0, secret: 0 });
  });

  it("não toca no texto comum", () => {
    const s = "Quero saber do plano anual de R$ 1.200,00 para 3 usuários.";
    expect(maskText(s)).toBe(s);
  });
});
