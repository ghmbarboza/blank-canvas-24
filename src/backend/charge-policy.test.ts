import { describe, expect, it } from "vitest";

import { decideCharge } from "./charge-policy";

const deal = (value: number | null, owner: string | null = "dono-do-negocio") => ({
  value,
  owner_user_id: owner,
});

describe("cobrança Asaas: quem e quanto (S5)", () => {
  it("atendente que não é dono do negócio não cobra", () => {
    const r = decideCharge({ role: "agent", userId: "outro", deal: deal(500), amount: 500 });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
  it("vendedor dono do negócio cobra até o valor do negócio", () => {
    expect(
      decideCharge({ role: "seller", userId: "dono-do-negocio", deal: deal(500), amount: 200 }),
    ).toEqual({ ok: true, amount: 200 });
    expect(
      decideCharge({ role: "seller", userId: "dono-do-negocio", deal: deal(500), amount: 501 }),
    ).toMatchObject({ ok: false, code: "amount_above_deal" });
  });
  it("sem valor informado, cobra o valor do negócio", () => {
    expect(
      decideCharge({
        role: "seller",
        userId: "dono-do-negocio",
        deal: deal(320.5),
        amount: undefined,
      }),
    ).toEqual({ ok: true, amount: 320.5 });
  });
  it("negócio sem valor: só gestor cobra", () => {
    expect(
      decideCharge({ role: "seller", userId: "dono-do-negocio", deal: deal(null), amount: 100 }),
    ).toMatchObject({ ok: false, code: "deal_without_value" });
    expect(decideCharge({ role: "manager", userId: "g", deal: deal(null), amount: 100 })).toEqual({
      ok: true,
      amount: 100,
    });
  });
  it("gestor também respeita o valor do negócio e o teto", () => {
    expect(
      decideCharge({ role: "admin", userId: "a", deal: deal(100), amount: 1000 }),
    ).toMatchObject({
      ok: false,
      code: "amount_above_deal",
    });
    expect(
      decideCharge({ role: "owner", userId: "a", deal: deal(null), amount: 20_000_000 }),
    ).toMatchObject({ ok: false, code: "bad_amount" });
    expect(decideCharge({ role: "owner", userId: "a", deal: deal(100), amount: -5 })).toMatchObject(
      {
        ok: false,
        code: "bad_amount",
      },
    );
    expect(
      decideCharge({ role: "owner", userId: "a", deal: deal(100), amount: "abc" }),
    ).toMatchObject({ ok: false, code: "bad_amount" });
  });
});
