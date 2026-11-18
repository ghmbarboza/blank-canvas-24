import { describe, expect, it } from "vitest";

import { parseTags } from "./api";

describe("parseTags", () => {
  it("separa por vírgula, sem repetir e sem vazio, mantendo como foi escrito", () => {
    expect(parseTags(" vip, Clínica Centro ,vip,, ")).toEqual(["vip", "Clínica Centro"]);
    expect(parseTags("")).toEqual([]);
  });
});
