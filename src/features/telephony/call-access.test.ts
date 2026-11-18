import { describe, expect, it } from "vitest";
import { canReadCall } from "./call-access";

describe("acesso à gravação (mesma regra de calls_select)", () => {
  it.each([
    ["seller", "other", null, false],
    ["seller", null, null, false],
    ["seller", "me", null, true],
    ["seller", "other", { owner_user_id: "other" }, false],
    ["seller", "other", { owner_user_id: "me" }, true],
    ["seller", "other", { owner_user_id: null }, true],
    ["manager", "other", null, true],
    ["agent", "other", null, true],
    ["owner", "other", null, true],
  ] as const)("%s, ligação %s, contato %j → %s", (role, callUser, contact, allowed) => {
    expect(canReadCall(role, "me", callUser, contact)).toBe(allowed);
  });
});
