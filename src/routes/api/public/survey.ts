import { createFileRoute } from "@tanstack/react-router";

// Pesquisas públicas (CSAT 1–5 e NPS 0–10) respondidas por link com token, sem login.
export const Route = createFileRoute("/api/public/survey")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const url = new URL(req.url);
          const kind = url.searchParams.get("kind");
          const token = url.searchParams.get("token") ?? "";
          if (!/^[0-9a-f]{36}$/.test(token))
            throw new h.HttpError(404, "Link inválido", "not_found");
          const db = h.admin();
          if (kind === "csat") {
            const { data } = await db
              .from("csat_responses")
              .select("score, answered_at, accounts(name), tickets(number, subject)")
              .eq("token", token)
              .maybeSingle();
            if (!data) throw new h.HttpError(404, "Pesquisa não encontrada", "not_found");
            const t = data.tickets as unknown as { number: number; subject: string } | null;
            return h.json({
              company: (data.accounts as unknown as { name: string } | null)?.name ?? "",
              question: t
                ? `Como foi o atendimento do chamado #${t.number} (${t.subject})?`
                : "Como foi o atendimento?",
              answered: Boolean(data.answered_at),
              score: data.score,
            });
          }
          if (kind === "nps") {
            const { data } = await db
              .from("nps_responses")
              .select("score, answered_at, accounts(name), nps_surveys(question, status)")
              .eq("token", token)
              .maybeSingle();
            if (!data) throw new h.HttpError(404, "Pesquisa não encontrada", "not_found");
            const s = data.nps_surveys as unknown as { question: string; status: string } | null;
            return h.json({
              company: (data.accounts as unknown as { name: string } | null)?.name ?? "",
              question: s?.question ?? "",
              answered: Boolean(data.answered_at),
              closed: s?.status === "closed",
              score: data.score,
            });
          }
          throw new h.HttpError(400, "Tipo inválido", "bad_kind");
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const b = await h.readJson<{
            kind?: string;
            token?: string;
            score?: number;
            comment?: string;
          }>(req, 8 * 1024);
          const token = String(b.token ?? "");
          if (!/^[0-9a-f]{36}$/.test(token))
            throw new h.HttpError(404, "Link inválido", "not_found");
          const score = Number(b.score);
          const comment =
            typeof b.comment === "string" ? b.comment.trim().slice(0, 2000) || null : null;
          const db = h.admin();
          const now = new Date().toISOString();
          if (b.kind === "csat") {
            if (!Number.isInteger(score) || score < 1 || score > 5)
              throw new h.HttpError(422, "Nota de 1 a 5", "invalid");
            const { data } = await db
              .from("csat_responses")
              .update({ score, comment, answered_at: now })
              .eq("token", token)
              .select("account_id, ticket_id")
              .maybeSingle();
            if (!data) throw new h.HttpError(404, "Pesquisa não encontrada", "not_found");
            if (data.ticket_id) {
              await db.from("tickets").update({ csat_score: score }).eq("id", data.ticket_id);
              await db.from("ticket_events").insert({
                account_id: data.account_id,
                ticket_id: data.ticket_id,
                kind: "csat",
                body: comment,
                meta: { score },
              });
            }
            return h.json({ ok: true });
          }
          if (b.kind === "nps") {
            if (!Number.isInteger(score) || score < 0 || score > 10)
              throw new h.HttpError(422, "Nota de 0 a 10", "invalid");
            const { data: row } = await db
              .from("nps_responses")
              .select("id, nps_surveys(status)")
              .eq("token", token)
              .maybeSingle();
            if (!row) throw new h.HttpError(404, "Pesquisa não encontrada", "not_found");
            if ((row.nps_surveys as unknown as { status: string } | null)?.status === "closed")
              throw new h.HttpError(409, "Esta pesquisa foi encerrada", "closed");
            await db
              .from("nps_responses")
              .update({ score, comment, answered_at: now })
              .eq("id", row.id);
            return h.json({ ok: true });
          }
          throw new h.HttpError(400, "Tipo inválido", "bad_kind");
        })(ctx);
      },
    },
  },
});
