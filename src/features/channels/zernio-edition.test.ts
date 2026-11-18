import { describe, expect, it } from "vitest";

import { EDITION } from "@/lib/edition";

import { zernioOptionAllowed } from "./zernio-edition";

describe("zernioOptionAllowed", () => {
  it("na edição de pós-venda só o Instagram entra pela Zernio", () => {
    expect(zernioOptionAllowed("instagram", EDITION)).toBe(true);
    expect(zernioOptionAllowed("whatsapp", EDITION)).toBe(false);
    expect(zernioOptionAllowed("facebook", EDITION)).toBe(false);
    expect(zernioOptionAllowed("metaads", EDITION)).toBe(false);
  });
  it("com todas as integrações liberadas, tudo entra", () => {
    expect(zernioOptionAllowed("whatsapp", { ...EDITION, allIntegrations: true })).toBe(true);
  });
});
