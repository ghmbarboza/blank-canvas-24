import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { fromStored } from "./useNexa";

const base = { id: "1", role: "assistant" as const, content: "Oi", actions: [] };

describe("fromStored", () => {
  it("lê blocos e ações das partes gravadas", () => {
    const t = fromStored({
      ...base,
      parts: [
        { type: "text", text: "Oi" },
        { type: "block", block: { kind: "x" } as never },
        { type: "action", action: { kind: "y" } as never },
      ],
    });
    expect(t.blocks).toHaveLength(1);
    expect(t.actions).toHaveLength(1);
    expect(t.text).toBe("Oi");
  });

  it("descarta partes fora do formato sem quebrar", () => {
    const t = fromStored({
      ...base,
      parts: [null, "lixo", { type: "block" }, { type: "action", action: 3 }] as never,
    });
    expect(t.blocks).toEqual([]);
    expect(t.actions).toEqual([]);
  });

  it("aguenta parts, actions e content com tipo errado", () => {
    const t = fromStored({ ...base, content: null, parts: {}, actions: "x" } as never);
    expect(t).toMatchObject({ text: "", blocks: [], actions: [], live: false });
  });

  it("mantém as ações antigas quando não há partes", () => {
    const t = fromStored({ ...base, actions: [{ kind: "z" } as never] });
    expect(t.actions).toHaveLength(1);
  });
});
