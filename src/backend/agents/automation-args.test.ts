import { describe, expect, it } from "vitest";

import { fillDeep, parseArgs } from "./automation-args";

describe("argumentos da ação", () => {
  it("preenche variáveis em textos aninhados sem mexer em números", () => {
    const out = fillDeep({ to: "{{email}}", body: ["Oi {{nome}}"], n: 3 }, (s) =>
      s.replace("{{email}}", "a@b.com").replace("{{nome}}", "Ana"),
    );
    expect(out).toEqual({ to: "a@b.com", body: ["Oi Ana"], n: 3 });
  });
  it("aceita objeto ou texto JSON e recusa JSON quebrado", () => {
    expect(parseArgs('{"a":1}')).toEqual({ a: 1 });
    expect(parseArgs({ a: 2 })).toEqual({ a: 2 });
    expect(parseArgs("")).toEqual({});
    expect(() => parseArgs("{quebrado")).toThrow("JSON");
    expect(() => parseArgs("[1]")).toThrow();
  });
});
