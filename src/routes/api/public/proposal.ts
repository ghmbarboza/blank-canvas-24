import { createFileRoute } from "@tanstack/react-router";

// Proposta pública (link enviado ao cliente): ver, registrar leitura, aceitar, recusar e pagar.
export const Route = createFileRoute("/api/public/proposal")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const c = await import("@/backend/commerce.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            token?: string;
            action?: "get" | "view" | "read" | "accept" | "decline" | "pay";
            seconds?: number;
            name?: string;
            document?: string;
            email?: string;
            reason?: string;
            billingType?: string;
          }>(req);
          const p = await c.proposalByToken(body.token);

          if (body.action === "get") return h.json(await c.publicView(p));

          if (body.action === "view") {
            await c.recordView(p, req, Number(body.seconds ?? 0));
            return h.json({ ok: true });
          }

          if (body.action === "read") {
            await c.recordReadTime(p, req, Number(body.seconds ?? 0));
            return h.json({ ok: true });
          }

          if (body.action === "accept") {
            const name = String(body.name ?? "").trim();
            const doc = String(body.document ?? "").replace(/\D/g, "");
            if (name.length < 3)
              throw new h.HttpError(422, "Informe seu nome completo", "bad_name");
            if (doc.length !== 11 && doc.length !== 14)
              throw new h.HttpError(422, "Informe um CPF ou CNPJ válido", "bad_document");
            await c.acceptProposal(p, req, name.slice(0, 160), doc);
            return h.json(await c.publicView(await c.proposalByToken(body.token)));
          }

          if (body.action === "decline") {
            await c.declineProposal(p, String(body.reason ?? "").trim());
            return h.json(await c.publicView(await c.proposalByToken(body.token)));
          }

          if (body.action === "pay") {
            if (p.status !== "accepted")
              throw new h.HttpError(409, "Aceite a proposta antes de pagar", "not_accepted");
            const db = h.admin();
            const { data: existing } = await db
              .from("payments")
              .select("id")
              .eq("proposal_id", p.id)
              .neq("status", "canceled")
              .limit(1);
            if (existing && existing.length > 0) return h.json(await c.publicView(p));
            // trava de 60 s: dois cliques simultâneos não chamam o Asaas duas vezes
            await h.rateLimit(
              `proposal:pay:${p.id}`,
              1,
              60,
              "A cobrança já está sendo gerada. Aguarde alguns segundos.",
            );
            const billing = ["PIX", "BOLETO", "CREDIT_CARD"].includes(String(body.billingType))
              ? (body.billingType as "PIX" | "BOLETO" | "CREDIT_CARD")
              : "UNDEFINED";
            const contact = p.contact_id
              ? (
                  await db
                    .from("contacts")
                    .select("email, phone")
                    .eq("id", p.contact_id)
                    .maybeSingle()
                ).data
              : null;
            const charges = await c.createCharges({
              accountId: p.account_id,
              dealId: p.deal_id,
              proposalId: p.id,
              contactId: p.contact_id,
              customer: {
                name: p.accepted_name ?? "Cliente",
                document: p.accepted_document ?? "",
                email: body.email?.trim() || contact?.email || null,
                phone: contact?.phone ?? null,
              },
              billingType: billing,
              oneTime: Number(p.one_time_total),
              monthly: Number(p.monthly_total),
              yearly: Number(p.yearly_total),
              description: `Proposta nº ${p.number} · ${p.title}`.slice(0, 200),
            });
            return h.json({ ...(await c.publicView(p)), charges });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
