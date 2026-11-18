import { describe, expect, it } from "vitest";

import {
  OWNER_MARK,
  addOwnerRules,
  ownerRules,
  removeOwnerRule,
  setHandoffRule,
  setUnknownRule,
} from "./agent-instructions";
import { withGreeting } from "./steps.server";

const BASE = "Você é o atendente de pós-venda.\nResponda com a base de conhecimento.";

describe("orientações do dono para o atendente", () => {
  it("acrescenta num bloco próprio, sem mexer no modelo pronto e sem repetir", () => {
    const a = addOwnerRules(BASE, ["Seja direto", "- Nunca prometa prazo"]);
    expect(a.startsWith(BASE)).toBe(true);
    expect(a).toContain(`${OWNER_MARK}\n- Seja direto\n- Nunca prometa prazo`);
    expect(ownerRules(addOwnerRules(a, ["seja direto", "Use o nome do cliente"]))).toEqual([
      "Seja direto",
      "Nunca prometa prazo",
      "Use o nome do cliente",
    ]);
  });
  it("tira uma orientação pelo trecho (sem ligar para acento)", () => {
    const a = addOwnerRules(BASE, ["Seja direto", "Nunca prometa prazo de entrega"]);
    const r = removeOwnerRule(a, "PRAZO");
    expect(r.removed).toBe(1);
    expect(ownerRules(r.text)).toEqual(["Seja direto"]);
    expect(removeOwnerRule(a, "desconto").removed).toBe(0);
    // tirou a última: o bloco some e sobra o modelo
    expect(removeOwnerRule(addOwnerRules(BASE, ["Seja direto"]), "direto").text).toBe(BASE);
  });
  it("'quando não sabe' e 'passar para uma pessoa' são uma orientação cada: a nova troca a antiga", () => {
    let t = setUnknownRule(BASE, "diga que vai confirmar com a equipe");
    t = setUnknownRule(t, "chame uma pessoa");
    t = setHandoffRule(t, "o cliente reclamar");
    expect(ownerRules(t)).toEqual([
      "Quando não souber responder: chame uma pessoa",
      "Passe a conversa para uma pessoa da equipe quando: o cliente reclamar",
    ]);
  });
  it("convive com a saudação: mudar uma não apaga a outra", () => {
    let t = addOwnerRules(BASE, ["Seja direto"]);
    t = withGreeting(t, "Oi! Aqui é a Bia.");
    t = addOwnerRules(t, ["Nunca prometa prazo"]);
    expect(ownerRules(t)).toEqual(["Seja direto", "Nunca prometa prazo"]);
    expect(t).toContain('cumprimente assim: "Oi! Aqui é a Bia."');
    t = withGreeting(t, "Olá, tudo bem?");
    expect(t).not.toContain("Aqui é a Bia");
    expect(ownerRules(t)).toEqual(["Seja direto", "Nunca prometa prazo"]);
  });
  it("barra excesso de orientações com mensagem que diz o que fazer", () => {
    const many = Array.from({ length: 21 }, (_, i) => `Orientação número ${i}`);
    expect(() => addOwnerRules(BASE, many)).toThrow(/tire alguma/);
  });
});
