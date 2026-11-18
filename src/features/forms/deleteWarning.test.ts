import { describe, expect, it } from "vitest";

import { formDeleteWarning } from "./deleteWarning";

describe("formDeleteWarning (A5)", () => {
  it("formulário no ar com envios: diz que está no ar, quantos envios e que o link para", () => {
    const t = formDeleteWarning(true, 3);
    expect(t).toContain("está no ar");
    expect(t).toContain("3 envios recebidos");
    expect(t).toContain("link público para de funcionar");
  });
  it("singular e zero", () => {
    expect(formDeleteWarning(false, 1)).toContain("1 envio recebido ");
    expect(formDeleteWarning(false, 0)).toContain("nenhum envio");
    expect(formDeleteWarning(false, 0)).not.toContain("está no ar");
  });
});
