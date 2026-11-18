// Quem pode emitir cobrança e de quanto (revisão de segurança de 04/11, S5). Ação de dinheiro:
// gestor, administrador ou dono da conta cobram qualquer negócio; o vendedor/atendente só o
// negócio que é dele. O valor nunca passa do valor do negócio; negócio sem valor só gestor cobra.
export const MAX_CHARGE = 10_000_000;

export interface ChargeInput {
  role: string;
  userId: string;
  deal: { value: number | null; owner_user_id: string | null };
  amount: unknown;
}

export type ChargeDecision =
  { ok: true; amount: number } | { ok: false; status: 403 | 422; code: string; message: string };

const MANAGERS = new Set(["owner", "admin", "manager"]);

export function decideCharge(p: ChargeInput): ChargeDecision {
  const isManager = MANAGERS.has(p.role);
  const isDealOwner = !!p.deal.owner_user_id && p.deal.owner_user_id === p.userId;
  if (!isManager && !isDealOwner)
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Só o responsável pelo negócio ou um gestor pode emitir cobrança",
    };
  const dealValue = Number(p.deal.value ?? 0);
  const raw = p.amount === undefined || p.amount === null ? dealValue : Number(p.amount);
  const amount = Math.round(raw * 100) / 100;
  if (!Number.isFinite(amount) || !(amount > 0) || amount > MAX_CHARGE)
    return { ok: false, status: 422, code: "bad_amount", message: "Valor inválido" };
  if (dealValue > 0 && amount > dealValue)
    return {
      ok: false,
      status: 422,
      code: "amount_above_deal",
      message: "O valor da cobrança não pode passar do valor do negócio",
    };
  if (!(dealValue > 0) && !isManager)
    return {
      ok: false,
      status: 422,
      code: "deal_without_value",
      message: "Preencha o valor do negócio antes de cobrar (ou peça a um gestor)",
    };
  return { ok: true, amount };
}
