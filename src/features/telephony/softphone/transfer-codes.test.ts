import { describe, expect, it } from "vitest";

import { transferCodes } from "./transfer-codes";

describe("transferCodes", () => {
  it("cega #ramal# e com aviso *ramal#, como a Zadarma documenta", () => {
    expect(transferCodes("101")).toEqual({ blind: "#101#", attended: "*101#" });
  });
  it("ramal inválido não gera código", () => {
    expect(transferCodes("")).toBeNull();
    expect(transferCodes("10a")).toBeNull();
  });
});
