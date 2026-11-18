import { describe, expect, it } from "vitest";

import { formatResolution, slaState } from "./constants";

const base = {
  created_at: "2026-10-22T12:00:00Z",
  first_response_at: null,
  first_response_due_at: "2026-10-22T13:00:00Z",
  resolution_due_at: "2026-10-23T12:00:00Z",
};

describe("SLA do chamado", () => {
  it("mostra a primeira resposta enquanto ninguém respondeu", () => {
    expect(slaState({ ...base, status: "open" }, Date.parse("2026-10-22T12:10:00Z"))).toMatchObject(
      { tone: "ok", label: "1ª resposta em 50 min" },
    );
  });
  it("alerta perto do prazo e marca atraso", () => {
    expect(slaState({ ...base, status: "open" }, Date.parse("2026-10-22T12:40:00Z")).tone).toBe(
      "warn",
    );
    expect(slaState({ ...base, status: "open" }, Date.parse("2026-10-22T15:00:00Z"))).toMatchObject(
      { tone: "late", label: "1ª resposta atrasada 2 h" },
    );
  });
  it("depois da resposta vale o prazo de solução; resolvido não conta", () => {
    expect(
      slaState(
        { ...base, status: "pending", first_response_at: "2026-10-22T12:30:00Z" },
        Date.parse("2026-10-22T14:00:00Z"),
      ).label,
    ).toBe("solução em 22 h");
    expect(slaState({ ...base, status: "resolved" }).tone).toBe("done");
  });
});

describe("tempo médio de resolução", () => {
  it("formata minutos, horas e dias", () => {
    expect(formatResolution(null)).toBe("—");
    expect(formatResolution(0.5)).toBe("30 min");
    expect(formatResolution(2.25)).toBe("2 h 15 min");
    expect(formatResolution(3)).toBe("3 h");
    expect(formatResolution(72)).toBe("3,0 d");
  });
});
