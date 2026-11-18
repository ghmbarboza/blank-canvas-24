import { describe, expect, it } from "vitest";

import { formEmbedCode, ownerModeLabel } from "./sources";

describe("formEmbedCode", () => {
  it("gera o div do formulário e o script do widget da conta", () => {
    expect(formEmbedCode("https://x.app", "acc", "f1")).toBe(
      '<div data-vinculo-form="f1"></div>\n<script src="https://x.app/api/public/widget.js" data-account="acc" async></script>',
    );
  });
});

describe("ownerModeLabel", () => {
  it("traduz o modo de distribuição", () => {
    expect(ownerModeLabel("round_robin")).toBe("rodízio de vendedores");
    expect(ownerModeLabel("user")).toBe("responsável fixo");
    expect(ownerModeLabel(undefined)).toBe("sem responsável automático");
  });
});
