import { describe, expect, it } from "vitest";

import { likePattern } from "./api-messages";

describe("likePattern", () => {
  it("envolve em % e escapa os curingas do LIKE", () => {
    expect(likePattern("boleto")).toBe("%boleto%");
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});
