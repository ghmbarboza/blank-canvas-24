import { createFileRoute } from "@tanstack/react-router";

// Proposta no app: enviar (marca como enviada e manda o link por e-mail) e devolver o link público;
// "sign" manda para assinatura eletrônica (ZapSign).
export const Route = createFileRoute("/api/proposals")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: "send" | "sign";
            proposalId?: string;
            email?: string;
            message?: string;
          }>(req);
          const caller = await h.requireMember(req, body.accountId, "member");
          if (!h.isUuid(body.proposalId)) throw new h.HttpError(400, "Proposta inválida", "bad_id");
          if (body.action !== "send" && body.action !== "sign")
            throw new h.HttpError(400, "Ação inválida", "bad_action");
          const db = h.admin();
          const { data: p } = await db
            .from("proposals")
            .select("*")
            .eq("id", body.proposalId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!p) throw new h.HttpError(404, "Proposta não encontrada", "not_found");
          const { data: deal } = await db
            .from("deals")
            .select("owner_user_id, title")
            .eq("id", p.deal_id)
            .maybeSingle();
          if (
            caller.role === "seller" &&
            deal?.owner_user_id &&
            deal.owner_user_id !== caller.userId
          )
            throw new h.HttpError(403, "Negócio de outro vendedor", "forbidden");
          // Proposta sai por e-mail para endereço livre: teto por pessoa (S12).
          await h.rateLimit(
            `proposal:${body.action}:${caller.userId}`,
            30,
            3600,
            "Muitos envios de proposta em pouco tempo. Espere uns minutos.",
          );
          if (body.action === "sign") {
            const sig = await import("@/backend/signature.server");
            return h.json(await sig.sendForSignature(caller, p.id));
          }
          if (!["draft", "sent", "viewed"].includes(p.status))
            throw new h.HttpError(409, "Esta proposta já foi respondida ou expirou", "closed");
          const link = `${h.appBaseUrl(req)}/proposta/${p.token}`;

          const contact = p.contact_id
            ? (await db.from("contacts").select("name, email").eq("id", p.contact_id).maybeSingle())
                .data
            : null;
          const to = (body.email ?? contact?.email ?? "").trim().toLowerCase();
          let emailed = false;
          if (to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            const { data: account } = await db
              .from("accounts")
              .select("name")
              .eq("id", caller.accountId)
              .single();
            const esc = (s: string) =>
              s.replace(
                /[&<>"]/g,
                (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!,
              );
            const first = contact?.name?.split(" ")[0];
            const intro =
              body.message?.trim() ||
              `Segue a proposta "${p.title}" da ${account?.name ?? "nossa equipe"}.`;
            const valid = p.valid_until
              ? new Date(`${p.valid_until}T12:00:00`).toLocaleDateString("pt-BR")
              : "—";
            const html = `<div style="font-family:Geist,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1F3B">
<p>Olá${first ? `, ${esc(first)}` : ""}!</p>
<p>${esc(intro)}</p>
<p style="margin:28px 0"><a href="${link}" style="background:#0A1F3B;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">Ver proposta nº ${p.number}</a></p>
<p style="color:#5b6b80;font-size:13px">Válida até ${valid}. Você pode aceitar online, em poucos cliques.</p></div>`;
            const { error } = await db.rpc("enqueue_job", {
              _account: caller.accountId,
              _kind: "email.send",
              _payload: {
                to_email: to,
                to_contact_id: p.contact_id,
                subject: `Proposta nº ${p.number}: ${p.title}`,
                html,
                category: "transactional",
                from_user_id: caller.userId,
              },
            });
            emailed = !error;
          }
          await db
            .from("proposals")
            .update({
              status: p.status === "draft" ? "sent" : p.status,
              sent_at: p.sent_at ?? new Date().toISOString(),
            })
            .eq("id", p.id);
          await db.from("activities").insert({
            account_id: caller.accountId,
            deal_id: p.deal_id,
            contact_id: p.contact_id,
            type: "email",
            title: `Proposta nº ${p.number} enviada${emailed ? ` para ${to}` : ""}`,
            user_id: caller.userId,
            done_at: new Date().toISOString(),
          });
          return h.json({ ok: true, link, emailed });
        })(ctx);
      },
    },
  },
});
