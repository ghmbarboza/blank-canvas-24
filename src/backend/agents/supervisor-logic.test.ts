import { describe, expect, it } from "vitest";

import { acceptFlags, obviousFlags, supervisorPrompt, type Snippet } from "./supervisor-logic";

const s: Snippet = {
  conversation_id: "c1",
  messages: [
    { from: "cliente", text: "Cadê meu pedido? Já faz 10 dias" },
    { from: "ia", text: "Garanto que chega até amanhã!" },
    { from: "cliente", text: "Isso é um ABSURDO, vou no Procon" },
  ],
};

describe("supervisor", () => {
  it("prompt leva os trechos com quem falou", () => {
    const p = supervisorPrompt([s]);
    expect(p.user).toContain("### c1");
    expect(p.user).toContain("ia: Garanto");
  });
  it("aceita só sinal com evidência real e conversa do lote", () => {
    const flags = acceptFlags(
      {
        flags: [
          {
            conversation_id: "c1",
            kind: "bad_promise",
            detail: "prometeu prazo",
            evidence: "Garanto que chega até amanhã",
          },
          { conversation_id: "c1", kind: "angry", detail: "x", evidence: "texto que não existe" },
          { conversation_id: "c9", kind: "angry", detail: "x", evidence: "ABSURDO" },
          { conversation_id: "c1", kind: "inventado", detail: "x", evidence: "ABSURDO" },
        ],
      },
      [s],
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("bad_promise");
  });
  it("sinais óbvios sem modelo: irritado e promessa de prazo", () => {
    const kinds = obviousFlags(s).map((f) => f.kind);
    expect(kinds).toContain("angry");
    expect(kinds).toContain("bad_promise");
  });
  it("conversa tranquila não gera sinal", () => {
    expect(
      obviousFlags({
        conversation_id: "c2",
        messages: [
          { from: "cliente", text: "obrigada" },
          { from: "ia", text: "Por nada, qualquer coisa estou aqui." },
        ],
      }),
    ).toEqual([]);
  });
});
