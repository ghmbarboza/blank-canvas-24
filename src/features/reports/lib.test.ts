import { describe, expect, it } from "vitest";

import {
  BOM,
  expectedByToday,
  formatMetric,
  normalizeConfig,
  pct,
  reportEmailHtml,
  toCsv,
} from "./lib";

describe("relatórios", () => {
  it("normaliza configuração inválida para algo que o banco aceita", () => {
    expect(
      normalizeConfig({ entity: "contacts", group_by: "stage_id", metric: "sum_value" }),
    ).toEqual({
      entity: "contacts",
      group_by: "none",
      metric: "count",
      date_field: "created_at",
      filters: [],
    });
    expect(
      normalizeConfig({
        entity: "deals",
        group_by: "owner_user_id",
        metric: "sum_value",
        date_field: "closed_at",
      }).date_field,
    ).toBe("closed_at");
  });
  it("descarta filtro vazio e limita a oito", () => {
    const filters = Array.from({ length: 12 }, (_, i) => ({
      field: "status",
      value: i % 2 ? "won" : "",
    }));
    expect(normalizeConfig({ entity: "deals", filters }).filters).toHaveLength(6);
  });
  it("CSV no padrão do Excel brasileiro, com aspas quando precisa", () => {
    const csv = toCsv(["Nome", "Valor"], [["Ana; Silva", 10.5]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain('"Ana; Silva";10,5');
  });
  it("formata dinheiro só nas métricas de valor", () => {
    expect(formatMetric("count", 3)).toBe("3");
    expect(formatMetric("sum_value", 1500)).toContain("1.500");
    expect(formatMetric("count", null)).toBe("—");
  });
  it("progresso e ritmo da meta", () => {
    expect(pct(50, 200)).toBe(25);
    expect(pct(10, 0)).toBe(0);
    expect(expectedByToday(300, new Date(2026, 3, 15))).toBe(150);
  });
  it("e-mail escapa o nome e mostra estado vazio", () => {
    const html = reportEmailHtml(
      "<script>",
      { entity: "deals", group_by: "status", metric: "count" },
      [],
      "https://x",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("Nada neste período");
  });
});
