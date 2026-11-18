import { createFileRoute } from "@tanstack/react-router";

// Cobrança a partir do negócio (Asaas): Pix, boleto ou cartão, avulsa ou mensal. Devolve link e Pix copia-e-cola.
// Ação de dinheiro: só o responsável pelo negócio ou gestor, até o valor do negócio (charge-policy).
export const Route = createFileRoute("/api/payments")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const c = await import("@/backend/commerce.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: "create";
            dealId?: string;
            billingType?: string;
            amount?: number;
            recurring?: "none" | "monthly";
            name?: string;
            document?: string;
            email?: string;
            dueDays?: number;
            description?: string;
          }>(req);
          const caller = await h.requireMember(req, body.accountId, "member");
          if (body.action !== "create") throw new h.HttpError(400, "Ação inválida", "bad_action");
          if (!h.isUuid(body.dealId)) throw new h.HttpError(400, "Negócio inválido", "bad_deal");
          const db = h.admin();
          const { data: deal } = await db
            .from("deals")
            .select("id, title, value, contact_id, owner_user_id")
            .eq("id", body.dealId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!deal) throw new h.HttpError(404, "Negócio não encontrado", "not_found");
          const { decideCharge } = await import("@/backend/charge-policy");
          const decision = decideCharge({
            role: caller.role,
            userId: caller.userId,
            deal,
            amount: body.amount,
          });
          if (!decision.ok) throw new h.HttpError(decision.status, decision.message, decision.code);
          const amount = decision.amount;
          const dueDays = Math.min(60, Math.max(1, Math.trunc(Number(body.dueDays ?? 3)) || 3));
          const contact = deal.contact_id
            ? (
                await db
                  .from("contacts")
                  .select("name, email, phone")
                  .eq("id", deal.contact_id)
                  .maybeSingle()
              ).data
            : null;
          const billing = ["PIX", "BOLETO", "CREDIT_CARD"].includes(String(body.billingType))
            ? (body.billingType as "PIX" | "BOLETO" | "CREDIT_CARD")
            : "UNDEFINED";
          const charges = await c.createCharges({
            accountId: caller.accountId,
            dealId: deal.id,
            proposalId: null,
            contactId: deal.contact_id,
            customer: {
              name: String(body.name ?? contact?.name ?? "Cliente").trim(),
              document: String(body.document ?? ""),
              email: body.email ?? contact?.email ?? null,
              phone: contact?.phone ?? null,
            },
            billingType: billing,
            oneTime: body.recurring === "monthly" ? 0 : amount,
            monthly: body.recurring === "monthly" ? amount : 0,
            yearly: 0,
            description: (body.description?.trim() || deal.title).slice(0, 200),
            dueDays,
            createdBy: caller.userId,
          });
          return h.json({ ok: true, charges });
        })(ctx);
      },
    },
  },
});
