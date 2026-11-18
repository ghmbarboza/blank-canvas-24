import { describe, expect, it } from "vitest";

import { answerText, blockNote, toBlock } from "./stage";

describe("toBlock", () => {
  it("monta opções com ícone válido e descarta ícone inventado", () => {
    const b = toBlock("mostrar_opcoes", {
      titulo: "Qual é o ramo?",
      opcoes: [
        { titulo: "Clínica", descricao: "Agendamentos", icone: "saude" },
        { titulo: "Loja", icone: "foguete" },
      ],
    });
    expect(b).toEqual({
      kind: "choices",
      title: "Qual é o ramo?",
      multiple: false,
      options: [
        { label: "Clínica", description: "Agendamentos", icon: "saude" },
        { label: "Loja" },
      ],
    });
  });

  it("aceita opções como texto solto ou JSON em texto", () => {
    const solto = toBlock("mostrar_opcoes", { titulo: "Sim?", opcoes: "Sim — agora\nNão" });
    expect(solto.kind === "choices" && solto.options.map((o) => o.label)).toEqual(["Sim", "Não"]);
    const json = toBlock("mostrar_opcoes", { titulo: "Sim?", opcoes: '["A","B"]' });
    expect(json.kind === "choices" && json.options.length).toBe(2);
  });

  it("recusa escolha com uma opção só e bloco sem título", () => {
    expect(() => toBlock("mostrar_opcoes", { titulo: "X", opcoes: ["A"] })).toThrow(/2 opções/);
    expect(() => toBlock("mostrar_etapas", { etapas: ["A"] })).toThrow(/título/);
  });

  it("formulário: nome derivado do rótulo, sem repetir, tipo desconhecido vira texto", () => {
    const b = toBlock("mostrar_formulario", {
      titulo: "Resend",
      campos: [
        { rotulo: "Chave da API", tipo: "segredo" },
        { rotulo: "Chave da API", tipo: "senha" },
      ],
    });
    expect(b.kind === "form" && b.fields.map((f) => [f.name, f.type])).toEqual([
      ["chave_da_api", "segredo"],
      ["chave_da_api_2", "texto"],
    ]);
    expect(b.kind === "form" && b.submit).toBe("Enviar");
  });

  it("cartão só aceita imagem https ou do próprio app", () => {
    const b = toBlock("mostrar_cartoes", {
      titulo: "Feito",
      cartoes: [
        { titulo: "A", imagem: "javascript:alert(1)" },
        { titulo: "B", imagem: "http://x.com/a.png" },
        { titulo: "C", imagem: "https://x.com/a.png" },
        { titulo: "D", imagem: "/nexa/guia.png" },
      ],
    });
    expect(b.kind === "cards" && b.cards.map((c) => c.image)).toEqual([
      undefined,
      undefined,
      "https://x.com/a.png",
      "/nexa/guia.png",
    ]);
  });

  it("etapas com estado inválido viram 'depois' e a lista tem teto", () => {
    const b = toBlock("mostrar_etapas", {
      titulo: "Plano",
      etapas: Array.from({ length: 12 }, (_, i) => ({
        titulo: `E${i}`,
        estado: i ? "x" : "feito",
      })),
    });
    expect(b.kind === "steps" && b.steps.length).toBe(8);
    expect(b.kind === "steps" && b.steps.slice(0, 2).map((s) => s.state)).toEqual([
      "feito",
      "depois",
    ]);
  });
});

describe("answerText e blockNote", () => {
  const form = toBlock("mostrar_formulario", {
    titulo: "Empresa",
    campos: [{ rotulo: "Nome" }, { rotulo: "Site", opcional: true }],
  });
  it("resposta do formulário pula campo vazio", () => {
    expect(answerText(form, { nome: " Vita ", site: "" })).toBe("Nome: Vita");
  });
  it("escolha vira 'Escolhi'", () => {
    const b = toBlock("mostrar_opcoes", { titulo: "Ramo", opcoes: ["A", "B"] });
    expect(answerText(b, ["A", "B"])).toBe("Escolhi: A, B");
    expect(blockNote(b)).toBe("[Na tela: Ramo → A | B]");
  });
});
