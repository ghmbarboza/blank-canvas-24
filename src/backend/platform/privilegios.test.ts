import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { ensurePrivileges, resetPrivilegesForTest } from "./privilegios.server";

describe("ensurePrivileges", () => {
  beforeEach(() => {
    rpc.mockReset();
    resetPrivilegesForTest();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("roda uma vez e não repete depois de dar certo", async () => {
    rpc.mockResolvedValue({ error: null });
    await ensurePrivileges();
    await ensurePrivileges();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("pedidos simultâneos não esperam a promessa um do outro: cada um faz a sua chamada", async () => {
    rpc.mockResolvedValue({ error: null });
    await Promise.all([ensurePrivileges(), ensurePrivileges()]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("falha não derruba o pedido e a próxima chamada tenta de novo", async () => {
    rpc.mockResolvedValueOnce({ error: new Error("fora do ar") });
    await expect(ensurePrivileges()).resolves.toBeUndefined();
    rpc.mockResolvedValue({ error: null });
    await ensurePrivileges();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
