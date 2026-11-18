import { describe, expect, it } from "vitest";

import { accountOfDedupe, isStuck, RETRY_MAX_AGE_MS, RETRY_MIN_AGE_MS } from "./zernio-retry";

describe("reprocessar aviso parado da Zernio", () => {
  it("lê a conta da chave de dedupe", () => {
    expect(accountOfDedupe("98E403F1-1c83-4e0c-82c8-77415df2b396:evt_123")).toBe(
      "98e403f1-1c83-4e0c-82c8-77415df2b396",
    );
    expect(accountOfDedupe("sem-conta:evt")).toBeNull();
    expect(accountOfDedupe(null)).toBeNull();
  });

  it("só reprocessa o que está parado há mais de 1 min e menos de 48 h", () => {
    const now = Date.parse("2026-11-05T02:10:00Z");
    expect(isStuck(new Date(now - 30_000).toISOString(), now)).toBe(false);
    expect(isStuck(new Date(now - RETRY_MIN_AGE_MS).toISOString(), now)).toBe(true);
    expect(isStuck(new Date(now - RETRY_MAX_AGE_MS - 1).toISOString(), now)).toBe(false);
  });
});
