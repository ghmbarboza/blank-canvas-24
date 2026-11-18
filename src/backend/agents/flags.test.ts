import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/http.server", () => ({ admin: () => ({}) }));

const { flagOutcome } = await import("./flags.server");

describe("flagOutcome", () => {
  it("sem erro, criou", () => expect(flagOutcome(null)).toBe("created"));
  it("23505 é a marcação aberta que já existe (índice parcial), não falha", () =>
    expect(flagOutcome({ code: "23505", message: "duplicate key" })).toBe("already_open"));
  it("42P10 e qualquer outro erro são falha de verdade", () => {
    expect(flagOutcome({ code: "42P10" })).toBe("failed");
    expect(flagOutcome({ code: "42501" })).toBe("failed");
  });
});
