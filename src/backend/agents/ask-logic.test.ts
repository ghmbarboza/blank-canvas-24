import { describe, expect, it } from "vitest";

import { READ_TOOLS, askTools, conversationQuery, period, safeLinks } from "./ask-logic";

const today = "2026-10-27";

describe("período", () => {
  it("padrão: últimos 30 dias", () => {
    expect(period({}, today)).toEqual({ from: "2026-09-28", to: "2026-10-27" });
  });
  it("corrige início depois do fim e limita a um ano", () => {
    expect(period({ from: "2026-11-01", to: "2026-10-01" }, today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(period({ from: "2020-01-01", to: "2026-10-27" }, today).from).toBe("2025-10-27");
  });
  it("ignora data mal escrita", () => {
    expect(period({ from: "ontem", to: "'; drop" }, today).to).toBe(today);
  });
});

describe("ferramentas de leitura", () => {
  it("cada uma chama uma RPC agregada com a conta", () => {
    for (const t of Object.values(READ_TOOLS)) {
      const call = t.rpc("acc", {}, today);
      expect(call.args["_account"]).toBe("acc");
      expect(call.fn).toMatch(
        /^(dashboard_gerencial|sac_metrics|report_|call_center_stats|agents_overview)/,
      );
    }
  });
  it("limita dias e meses", () => {
    expect(READ_TOOLS["painel_gerencial"]!.rpc("a", { days: 9999 }, today).args["_days"]).toBe(90);
    expect(READ_TOOLS["previsao_vendas"]!.rpc("a", { months: -3 }, today).args["_months"]).toBe(1);
  });
  it("criar agente só para gestor", () => {
    expect(askTools(false).map((t) => t.name)).not.toContain("criar_agente");
    expect(askTools(true).map((t) => t.name)).toContain("criar_agente");
    expect(askTools(true).at(-1)?.name).toBe("responder");
  });
});

it("busca de conversas limpa o texto e fixa a situação", () => {
  const q = conversationQuery({ text: "entrega%,(x)", status: "hack", unanswered: true }, today);
  expect(q.text).toBe("entrega   x");
  expect(q.status).toBe("any");
  expect(q.unanswered).toBe(true);
});

it("só links internos", () => {
  expect(
    safeLinks([
      { label: "Conversa", href: "/inbox/123" },
      { label: "Fora", href: "https://evil.com" },
      { label: "js", href: "javascript:alert(1)" },
    ]),
  ).toEqual([{ label: "Conversa", href: "/inbox/123" }]);
});
