import { createFileRoute } from "@tanstack/react-router";

// Atendimento: playground e suíte do agente de IA, embeddings da base e envio de NPS.
export const Route = createFileRoute("/api/support")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: string;
            question?: string;
            history?: { role: "user" | "assistant"; content: string }[];
            caseIds?: string[];
            articleId?: string;
            surveyId?: string;
            results?: unknown[];
          }>(req);
          const db = h.admin();

          if (body.action === "agent.test") {
            const caller = await h.requireMember(req, body.accountId, "manager");
            await h.rateLimit(`ai:agent-test:${caller.userId}`, 40, 600);
            const question = String(body.question ?? "")
              .trim()
              .slice(0, 2000);
            if (!question) throw new h.HttpError(400, "Escreva uma pergunta", "empty");
            const { decide, loadAgentSettings } = await import("@/backend/support/agent.server");
            const { settings, name } = await loadAgentSettings(caller.accountId);
            const history = [
              ...(body.history ?? []).slice(-10),
              { role: "user" as const, content: question },
            ];
            const started = Date.now();
            const d = await decide(caller.accountId, history, { name, settings });
            return h.json({ ...d, ms: Date.now() - started });
          }

          if (body.action === "eval.run") {
            const caller = await h.requireMember(req, body.accountId, "manager");
            await h.rateLimit(`ai:eval:${caller.accountId}`, 10, 3600);
            const ids = (body.caseIds ?? []).filter(h.isUuid).slice(0, 6);
            if (ids.length === 0)
              throw new h.HttpError(400, "Nenhuma pergunta para avaliar", "empty");
            const { data: cases } = await db
              .from("ai_eval_cases")
              .select("*")
              .eq("account_id", caller.accountId)
              .in("id", ids);
            const { decide, loadAgentSettings } = await import("@/backend/support/agent.server");
            const { gradeEval } = await import("@/backend/support/agent-logic");
            const { settings, name } = await loadAgentSettings(caller.accountId);
            const results = [];
            for (const c of cases ?? []) {
              try {
                const d = await decide(caller.accountId, [{ role: "user", content: c.question }], {
                  name,
                  settings,
                });
                const g = gradeEval(c, { handoff: d.action === "handoff", reply: d.reply });
                results.push({
                  case_id: c.id,
                  question: c.question,
                  action: d.action,
                  reply: d.reply,
                  reason: d.reason,
                  passed: g.passed,
                  grade: g.reason,
                });
              } catch (err) {
                results.push({
                  case_id: c.id,
                  question: c.question,
                  action: "error",
                  reply: "",
                  reason: err instanceof Error ? err.message : String(err),
                  passed: false,
                  grade: "erro ao chamar a IA",
                });
              }
            }
            return h.json({ results });
          }

          if (body.action === "eval.save") {
            const caller = await h.requireMember(req, body.accountId, "manager");
            const results = (Array.isArray(body.results) ? body.results : []).slice(0, 500) as {
              passed?: boolean;
            }[];
            const passed = results.filter((r) => r.passed).length;
            const { data, error } = await db
              .from("ai_eval_runs")
              .insert({
                account_id: caller.accountId,
                started_by: caller.userId,
                total: results.length,
                passed,
                accept_rate: results.length ? passed / results.length : null,
                results: results as never,
              })
              .select("id, accept_rate")
              .single();
            if (error) throw new h.HttpError(500, error.message, "save");
            return h.json(data);
          }

          if (body.action === "ticket.reply_email") {
            const caller = await h.requireMember(req, body.accountId, "member");
            const b = body as unknown as { ticketId?: string; body?: string };
            const text = String(b.body ?? "")
              .trim()
              .slice(0, 10_000);
            if (!h.isUuid(b.ticketId) || !text)
              throw new h.HttpError(400, "Resposta vazia", "empty");
            const { data: t } = await db
              .from("tickets")
              .select("id, number, subject, owner_user_id, contacts(id, email)")
              .eq("id", b.ticketId)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!t) throw new h.HttpError(404, "Chamado não encontrado", "not_found");
            if (caller.role === "seller" && t.owner_user_id && t.owner_user_id !== caller.userId)
              throw new h.HttpError(403, "Chamado de outro vendedor", "forbidden");
            const contact = t.contacts as unknown as { id: string; email: string | null } | null;
            if (!contact?.email) throw new h.HttpError(409, "O cliente não tem e-mail", "no_email");
            const escape = (s: string) =>
              s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            await db.rpc("enqueue_job", {
              _account: caller.accountId,
              _kind: "email.send",
              _payload: {
                to_email: contact.email,
                to_contact_id: contact.id,
                subject: `Re: [#${t.number}] ${t.subject}`,
                html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${escape(text).replace(/\n/g, "<br>")}</div>`,
                text,
                category: "transactional",
                from_user_id: caller.userId,
              } as never,
            });
            await db.from("ticket_events").insert({
              account_id: caller.accountId,
              ticket_id: t.id,
              kind: "comment",
              body: text,
              is_public: true,
              author_user_id: caller.userId,
              meta: { channel: "email" },
            });
            return h.json({ ok: true });
          }

          if (body.action === "kb.embed") {
            const caller = await h.requireMember(req, body.accountId, "member");
            if (!h.isUuid(body.articleId)) throw new h.HttpError(400, "Artigo inválido", "bad_id");
            const { data: art } = await db
              .from("kb_articles")
              .select("id")
              .eq("id", body.articleId)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!art) throw new h.HttpError(404, "Artigo não encontrado", "not_found");
            await db.rpc("enqueue_job", {
              _account: caller.accountId,
              _kind: "kb.embed",
              _payload: { article_id: body.articleId } as never,
              _dedupe: `kb.embed:${body.articleId}`,
            });
            return h.json({ ok: true });
          }

          if (body.action === "nps.send") {
            const caller = await h.requireMember(req, body.accountId, "manager");
            if (!h.isUuid(body.surveyId)) throw new h.HttpError(400, "Pesquisa inválida", "bad_id");
            const { data: survey } = await db
              .from("nps_surveys")
              .select("*")
              .eq("id", body.surveyId)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!survey) throw new h.HttpError(404, "Pesquisa não encontrada", "not_found");
            if (survey.status !== "draft")
              throw new h.HttpError(409, "Esta pesquisa já foi enviada", "already_sent");
            const { applySegment, isSegmentFilter } = await import("@/features/segments/rules");
            let filter = null;
            if (survey.segment_id) {
              const { data: seg } = await db
                .from("segments")
                .select("filter")
                .eq("id", survey.segment_id)
                .eq("account_id", caller.accountId)
                .maybeSingle();
              filter = isSegmentFilter(seg?.filter) ? seg.filter : null;
            }
            const column = survey.channel === "email" ? "email" : "phone";
            const q = applySegment(
              db
                .from("contacts")
                .select("id, name, email, phone")
                .eq("account_id", caller.accountId)
                .not(column, "is", null)
                .limit(5000),
              filter,
            );
            const { data: people, error } = await q;
            if (error) throw new h.HttpError(500, error.message, "audience");
            const base = h.appBaseUrl(req);
            let sent = 0;
            for (const p of people ?? []) {
              const { data: ok } = await db.rpc("can_contact", {
                _contact: p.id,
                _channel: survey.channel,
              });
              if (!ok) continue;
              const { data: row } = await db
                .from("nps_responses")
                .insert({ account_id: caller.accountId, survey_id: survey.id, contact_id: p.id })
                .select("token")
                .maybeSingle();
              if (!row) continue;
              const link = `${base}/nps/${row.token}`;
              const first = p.name?.split(" ")[0] ?? "";
              const text = `Oi${first ? `, ${first}` : ""}! ${survey.question} Responda em 10 segundos: ${link}`;
              const payload =
                survey.channel === "email"
                  ? {
                      to_email: p.email,
                      to_contact_id: p.id,
                      subject: survey.question.slice(0, 120),
                      html: `<p>${text.replace(link, `<a href="${link}">responder</a>`)}</p>`,
                      text,
                      category: "marketing",
                    }
                  : { contact_id: p.id, text, category: "marketing" };
              await db.rpc("enqueue_job", {
                _account: caller.accountId,
                _kind: survey.channel === "email" ? "email.send" : "whatsapp.send",
                _payload: payload as never,
              });
              sent += 1;
            }
            await db
              .from("nps_surveys")
              .update({ status: "sent", sent_count: sent, sent_at: new Date().toISOString() })
              .eq("id", survey.id)
              .eq("account_id", caller.accountId);
            return h.json({ sent });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
