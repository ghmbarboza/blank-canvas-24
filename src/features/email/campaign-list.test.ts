import { describe, expect, it } from "vitest";

import { engagement, matchesScope } from "./campaign-list";

describe("matchesScope", () => {
  it("agrupa pausada com enviando em 'Em andamento'", () => {
    expect(matchesScope("sending", "running")).toBe(true);
    expect(matchesScope("paused", "running")).toBe(true);
    expect(matchesScope("sent", "running")).toBe(false);
  });

  it("agrupa enviada e cancelada em 'Encerradas'", () => {
    expect(matchesScope("sent", "done")).toBe(true);
    expect(matchesScope("canceled", "done")).toBe(true);
    expect(matchesScope("draft", "done")).toBe(false);
  });

  it("'Todas' aceita qualquer status", () => {
    expect(matchesScope("qualquer", "all")).toBe(true);
  });
});

describe("engagement", () => {
  it("não inventa taxa quando nada foi enviado", () => {
    expect(engagement(null)).toEqual({
      sent: 0,
      opened: 0,
      clicked: 0,
      openRate: null,
      clickRate: null,
    });
  });

  it("calcula abertura e clique sobre os enviados", () => {
    const e = engagement({ sent: 200, opened: 50, clicked: 10 });
    expect(e.openRate).toBe(0.25);
    expect(e.clickRate).toBe(0.05);
  });
});
