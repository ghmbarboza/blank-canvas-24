import { describe, expect, it } from "vitest";

import { currentCategory, suggestForecast, type MinutesSignals } from "./forecast-suggestion";

const NOW = new Date("2026-10-21T12:00:00Z").getTime();
const clean: MinutesSignals = {
  risks: [],
  objections: [{ objection: "preço", handled: true }],
  decisions: ["Fechar piloto em novembro"],
  next_steps: [{ title: "Enviar contrato assinado", owner: "cliente", due_in_days: 5 }],
  score: 82,
};

describe("currentCategory", () => {
  it("lê do custom e cai em pipeline quando vazio ou inválido", () => {
    expect(currentCategory({ forecast_category: "commit" })).toBe("commit");
    expect(currentCategory({ forecast_category: "xyz" })).toBe("pipeline");
    expect(currentCategory(null)).toBe("pipeline");
  });
});

describe("suggestForecast", () => {
  it("riscos demais rebaixam um degrau e explicam o porquê", () => {
    const s = suggestForecast(
      "commit",
      { ...clean, risks: ["orçamento", "prazo", "concorrente"] },
      null,
      NOW,
    );
    expect(s?.suggested).toBe("best_case");
    expect(s?.reasons[0]).toBe("3 riscos apontados na reunião");
    expect(s?.reasons).toContain("orçamento");
  });

  it("objeções sem resposta e nota baixa também rebaixam", () => {
    const s = suggestForecast(
      "best_case",
      {
        ...clean,
        objections: [
          { objection: "a", handled: false },
          { objection: "b", handled: false },
        ],
      },
      null,
      NOW,
    );
    expect(s?.suggested).toBe("pipeline");
    expect(suggestForecast("best_case", { ...clean, score: 30 }, null, NOW)?.suggested).toBe(
      "pipeline",
    );
  });

  it("pipeline com sinal ruim não tem para onde descer", () => {
    expect(suggestForecast("pipeline", { ...clean, score: 10 }, null, NOW)).toBeNull();
  });

  it("reunião forte sobe pipeline para melhor cenário", () => {
    expect(suggestForecast("pipeline", clean, null, NOW)?.suggested).toBe("best_case");
  });

  it("compromisso só com fechamento previsto nos próximos 45 dias", () => {
    expect(suggestForecast("best_case", clean, "2026-11-10", NOW)?.suggested).toBe("commit");
    expect(suggestForecast("best_case", clean, "2027-03-01", NOW)).toBeNull();
    expect(suggestForecast("best_case", clean, null, NOW)).toBeNull();
    expect(suggestForecast("best_case", clean, "2026-10-01", NOW)).toBeNull();
  });

  it("sem passo do cliente ou com nota mediana não sugere nada", () => {
    expect(
      suggestForecast(
        "pipeline",
        { ...clean, next_steps: [{ title: "x", owner: "vendedor" }] },
        null,
        NOW,
      ),
    ).toBeNull();
    expect(suggestForecast("pipeline", { ...clean, score: 60 }, null, NOW)).toBeNull();
    expect(suggestForecast("commit", clean, "2026-11-01", NOW)).toBeNull();
  });

  it("fora do forecast é escolha do vendedor e nunca muda", () => {
    expect(suggestForecast("omitted", { ...clean, risks: ["a", "b", "c"] }, null, NOW)).toBeNull();
  });
});
