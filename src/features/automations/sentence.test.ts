import { describe, expect, it } from "vitest";

import { blankGraph, TEMPLATES } from "./templates";
import { buildSentence, triggerPhrase } from "./sentence";

describe("triggerPhrase", () => {
  it("fala o gatilho de evento como frase", () => {
    expect(triggerPhrase({ type: "event", event: "form.submitted" })).toBe(
      "Quando um formulário é enviado",
    );
  });
  it("traduz sem resposta e inscrição manual", () => {
    expect(triggerPhrase({ type: "no_reply", hours: 24 })).toBe(
      "Quando a conversa fica 24 h sem resposta",
    );
    expect(triggerPhrase({ type: "manual" })).toBe("Quando você inscreve alguém");
  });
  it("não quebra com evento desconhecido", () => {
    expect(triggerPhrase({ type: "event", event: "x.y" })).toBe("Quando: x.y");
  });
});

describe("buildSentence", () => {
  it("monta boas-vindas seguindo o ramo do prazo que acabou", () => {
    const t = TEMPLATES.find((x) => x.key === "boas_vindas")!;
    const s = buildSentence(t.trigger, t.graph);
    expect(s.trigger).toBe("Quando um formulário é enviado");
    expect(s.steps.map((x) => x.text)).toEqual([
      "manda WhatsApp",
      "manda e-mail",
      "se não responder em 1 dia,",
      "cria tarefa para o atendente",
    ]);
    expect(s.more).toBe(0);
  });

  it("corta em max e conta o resto", () => {
    const t = TEMPLATES.find((x) => x.key === "boas_vindas")!;
    const s = buildSentence(t.trigger, t.graph, 2);
    expect(s.steps).toHaveLength(2);
    expect(s.more).toBe(2);
  });

  it("grafo vazio vira só o gatilho", () => {
    const s = buildSentence({ type: "manual" }, blankGraph());
    expect(s.steps.length).toBeLessThanOrEqual(1);
  });

  it("não entra em laço quando o grafo aponta para trás", () => {
    const s = buildSentence(
      { type: "manual" },
      {
        start: "a",
        nodes: {
          a: { id: "a", type: "wait", config: { minutes: 60 }, next: "b" },
          b: { id: "b", type: "email", config: {}, next: "a" },
        },
      },
    );
    expect(s.steps.map((x) => x.text)).toEqual(["espera 1 hora", "manda e-mail"]);
  });

  it("todos os modelos geram frase com pelo menos um passo", () => {
    for (const t of TEMPLATES) {
      expect(buildSentence(t.trigger, t.graph).steps.length).toBeGreaterThan(0);
    }
  });
});
