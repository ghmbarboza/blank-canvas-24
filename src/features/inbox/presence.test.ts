import { describe, expect, it } from "vitest";

import { collisionText, othersInConversation } from "./presence";

const names: Record<string, string> = { a: "Ana", b: "Bruno", c: "Carla" };
const nameOf = (id: string) => names[id];

describe("othersInConversation", () => {
  it("tira a própria pessoa, junta abas da mesma pessoa e põe quem digita primeiro", () => {
    const v = othersInConversation(
      {
        k1: [{ user_id: "me", typing: true }],
        k2: [{ user_id: "a", typing: false }],
        k3: [
          { user_id: "b", typing: false },
          { user_id: "b", typing: true },
        ],
      },
      "me",
      nameOf,
    );
    expect(v).toEqual([
      { userId: "b", name: "Bruno", typing: true },
      { userId: "a", name: "Ana", typing: false },
    ]);
  });

  it("quem não está na lista de membros vira 'Alguém da equipe'", () => {
    expect(
      othersInConversation({ k: [{ user_id: "x", typing: false }] }, "me", nameOf)[0]?.name,
    ).toBe("Alguém da equipe");
  });
});

describe("collisionText", () => {
  it("ninguém: sem faixa", () => {
    expect(collisionText([])).toBeNull();
  });
  it("só vendo", () => {
    expect(collisionText([{ userId: "a", name: "Ana", typing: false }])).toBe(
      "Ana também está nesta conversa.",
    );
  });
  it("digitando pesa mais e avisa do risco de resposta dupla", () => {
    const t = collisionText([
      { userId: "a", name: "Ana", typing: true },
      { userId: "c", name: "Carla", typing: true },
      { userId: "b", name: "Bruno", typing: false },
    ]);
    expect(t).toBe(
      "Ana e Carla estão digitando uma resposta. Combine antes para o cliente não receber duas.",
    );
  });
});
