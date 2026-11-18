import { describe, expect, it, vi } from "vitest";

import { ensureWithRetry } from "./ensure";

const noWait = () => Promise.resolve();

describe("ensureWithRetry", () => {
  it("passa de primeira sem esperar", async () => {
    const call = vi.fn().mockResolvedValue({});
    expect(await ensureWithRetry(call, [1, 1], noWait)).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("falha na primeira, passa na segunda e não acusa erro", async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
    expect(await ensureWithRetry(call, [1, 1], noWait)).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("devolve o último erro quando todas as tentativas falham", async () => {
    const erro = new Error("fora");
    const call = vi.fn().mockRejectedValue(erro);
    expect(await ensureWithRetry(call, [1, 1], noWait)).toEqual({ ok: false, error: erro });
    expect(call).toHaveBeenCalledTimes(3);
  });
});

describe("needsPublish", () => {
  it("pede para publicar quando não há endereço gravado", async () => {
    const { needsPublish } = await import("./ensure");
    expect(needsPublish({ app_base_url: null })).toBe(true);
    expect(needsPublish(null)).toBe(true);
  });
  it("não avisa quando o endereço publicado já está gravado", async () => {
    const { needsPublish } = await import("./ensure");
    expect(needsPublish({ app_base_url: "https://minha.lovable.app" })).toBe(false);
  });
});
