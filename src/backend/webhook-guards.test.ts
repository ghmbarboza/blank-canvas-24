// Webhooks públicos: sem assinatura/token, 401 antes de olhar o corpo (revisão de 04/11, S8).
import { describe, expect, it, vi } from "vitest";

const getIntegration = vi.fn();
vi.mock("@/backend/integrations.server", () => ({ getIntegration }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

describe("Asaas", () => {
  it("sem token responde 401, mesmo sem referência do Vínculo", async () => {
    const { handleAsaasWebhook } = await import("./commerce.server");
    await expect(
      handleAsaasWebhook({ event: "PAYMENT_RECEIVED" } as never, null),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(getIntegration).not.toHaveBeenCalled();
  });
  it("com ?a=<conta>, token errado responde 401 antes da referência", async () => {
    getIntegration.mockResolvedValueOnce({ secrets: { webhook_token: "certo" }, config: {} });
    const { handleAsaasWebhook } = await import("./commerce.server");
    await expect(
      handleAsaasWebhook(
        { event: "PAYMENT_RECEIVED" } as never,
        "errado",
        "8371c770-b8e5-4e55-9ce6-5cf44c30b5ac",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("Composio", () => {
  it("sem cabeçalhos de assinatura responde 401", async () => {
    const { handleComposioWebhook } = await import("./agents/composio.server");
    const r = await handleComposioWebhook("{}", { id: null, timestamp: null, signature: null });
    expect(r.status).toBe(401);
  });
  it("assinado mas de usuário desconhecido também é 401 (não 200)", async () => {
    const { handleComposioWebhook } = await import("./agents/composio.server");
    const r = await handleComposioWebhook(JSON.stringify({ type: "x" }), {
      id: "msg_1",
      timestamp: "1",
      signature: "v1,abc",
    });
    expect(r.status).toBe(401);
  });
});
