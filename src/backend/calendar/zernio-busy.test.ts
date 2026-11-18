import { describe, expect, it } from "vitest";

import { matchMailboxes, parseFreeBusy } from "./zernio-busy.server";

describe("agenda pela Zernio", () => {
  it("liga a caixa à pessoa pelo e-mail, sem diferença de caixa e espaço", () => {
    const m = matchMailboxes(
      [
        { id: "g1", email: "Ana@Empresa.com.br " },
        { id: "m1", email: "ana@empresa.com.br" },
        { id: "x", email: "outra@empresa.com.br" },
      ],
      [
        { id: "u-ana", email: "ana@empresa.com.br" },
        { id: "u-bia", email: "bia@empresa.com.br" },
      ],
    );
    expect(m.get("u-ana")).toEqual(["g1", "m1"]);
    expect(m.has("u-bia")).toBe(false);
    expect(m.size).toBe(1);
  });

  it("lê os blocos ocupados e descarta horário inválido", () => {
    const r = parseFreeBusy({
      data: [
        {
          accountId: "g1",
          busy: [
            { start: "2026-11-05T12:00:00Z", end: "2026-11-05T13:00:00Z" },
            { start: "lixo", end: "2026-11-05T13:00:00Z" },
            { start: "2026-11-05T15:00:00Z", end: "2026-11-05T14:00:00Z" },
          ],
        },
        { accountId: "m1" },
      ],
    });
    expect(r.get("g1")).toEqual([
      { start: Date.parse("2026-11-05T12:00:00Z"), end: Date.parse("2026-11-05T13:00:00Z") },
    ]);
    expect(r.get("m1")).toEqual([]);
  });
});
