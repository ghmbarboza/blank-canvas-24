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
    expect(rpc).toHaveBeenCalledTimes(2); // privilégios + tempo real
  });

  it("pedidos simultâneos: só um executa, o outro segue sem esperar nem repetir", async () => {
    rpc.mockResolvedValue({ error: null });
    await Promise.all([ensurePrivileges(), ensurePrivileges()]);
    expect(rpc).toHaveBeenCalledTimes(2); // privilégios + tempo real, uma vez só
  });

  it("falha não derruba o pedido e não vira rajada: só tenta de novo depois de um minuto", async () => {
    rpc.mockResolvedValueOnce({ error: new Error("fora do ar") });
    await expect(ensurePrivileges()).resolves.toBeUndefined();
    rpc.mockResolvedValue({ error: null });
    await ensurePrivileges();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
