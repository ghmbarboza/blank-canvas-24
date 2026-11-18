import { describe, expect, it } from "vitest";

import { capacityTone, queueMembers, queueSentence } from "./routing-copy";

const text = (s: { text: string }[]) => s.map((x) => x.text).join("");

describe("queueSentence", () => {
  it("lê a fila como frase e destaca canais e habilidade", () => {
    const s = queueSentence({
      channels: ["whatsapp", "voice"],
      skills: ["suporte"],
      required_level: 3,
      sla_seconds: 20,
      overflow: "callback",
    });
    expect(text(s)).toBe(
      "Se o cliente chegar por WhatsApp ou Telefone, vai para quem sabe suporte (nível 3 ou mais). Atender em até 20 s. Se ninguém estiver livre, registra um retorno de ligação.",
    );
    expect(s.filter((x) => x.strong).map((x) => x.text)).toEqual([
      "WhatsApp",
      "Telefone",
      "suporte",
      "20 s",
    ]);
  });

  it("sem habilidade vai para qualquer pessoa", () => {
    const s = queueSentence({
      channels: ["email"],
      skills: [],
      required_level: 1,
      sla_seconds: 20,
      overflow: "none",
    });
    expect(text(s)).toContain("vai para qualquer pessoa da equipe");
    expect(text(s)).not.toContain("Atender em até");
  });
});

describe("queueMembers", () => {
  const team = [
    { userId: "a", agent: { is_active: true }, skills: [{ skill: "suporte", level: 4 }] },
    { userId: "b", agent: { is_active: true }, skills: [{ skill: "suporte", level: 2 }] },
    { userId: "c", agent: { is_active: false }, skills: [{ skill: "suporte", level: 5 }] },
    { userId: "d", agent: null, skills: [] },
  ];
  it("filtra por habilidade, nível e quem atende na fila", () => {
    expect(
      queueMembers({ skills: ["suporte"], required_level: 3 }, team).map((m) => m.userId),
    ).toEqual(["a"]);
    expect(queueMembers({ skills: [], required_level: 1 }, team).map((m) => m.userId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("capacityTone", () => {
  it("diz se está livre, ocupando, cheio ou acima", () => {
    expect(capacityTone(0, 4)).toBe("idle");
    expect(capacityTone(2, 4)).toBe("ok");
    expect(capacityTone(4, 4)).toBe("full");
    expect(capacityTone(5, 4)).toBe("over");
    expect(capacityTone(1, 0)).toBe("over");
  });
});
