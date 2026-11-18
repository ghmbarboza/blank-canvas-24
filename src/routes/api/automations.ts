import { createFileRoute } from "@tanstack/react-router";

// Automações: ativar/pausar (com validação), inscrever contatos (lote, segmento, negócio),
// prévia de "quem entraria agora" e simulação passo a passo num contato de teste (sem enviar nada).
export const Route = createFileRoute("/api/automations")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            accountId?: string;
            action?: "activate" | "pause" | "enroll" | "preview" | "simulate" | "stop_run";
            automationId?: string;
            contactIds?: string[];
            segmentId?: string;
            dealId?: string;
            contactId?: string;
            runId?: string;
          }>(req);
          const engine = await import("@/features/automations/engine");
          const rt = await import("@/backend/automations/runtime.server");
          const { applySegment, isSegmentFilter } = await import("@/features/segments/rules");
          const db = h.admin();
          const manage = body.action === "activate" || body.action === "pause";
          const caller = await h.requireMember(req, body.accountId, manage ? "manager" : "member");
          const { requireModule } = await import("@/backend/modules.server");
          await requireModule(caller, "automacoes");

          if (body.action === "stop_run") {
            if (!h.isUuid(body.runId)) throw new h.HttpError(400, "Inscrição inválida", "bad_run");
            const { data: run } = await db
              .from("automation_runs")
              .select("*")
              .eq("id", body.runId)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!run) throw new h.HttpError(404, "Inscrição não encontrada", "not_found");
            await rt.finishRun(run, "exited", "manual");
            return h.json({ ok: true });
          }

          if (!h.isUuid(body.automationId))
            throw new h.HttpError(400, "Automação inválida", "bad_automation");
          const { data: auto } = await db
            .from("automations")
            .select("*")
            .eq("id", body.automationId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!auto) throw new h.HttpError(404, "Automação não encontrada", "not_found");
          const graph = auto.graph as unknown as import("@/features/automations/engine").Graph;
          const trigger =
            auto.trigger as unknown as import("@/features/automations/engine").Trigger;

          if (body.action === "activate") {
            const errors = engine.validateGraph(graph);
            if (errors.length) throw new h.HttpError(422, errors.join(" · "), "invalid_graph");
            await db
              .from("automations")
              .update({
                status: "active",
                activated_at: new Date().toISOString(),
                version: auto.version + 1,
              })
              .eq("id", auto.id)
              .eq("account_id", caller.accountId);
            // Retoma inscrições que estavam pausadas junto com a automação.
            const { data: paused } = await db
              .from("automation_runs")
              .select("id, step_seq")
              .eq("automation_id", auto.id)
              .eq("status", "paused");
            for (const r of paused ?? []) {
              await db
                .from("automation_runs")
                .update({ status: "running" })
                .eq("id", r.id)
                .eq("account_id", caller.accountId);
              await rt.scheduleStep(caller.accountId, r.id, r.step_seq, new Date());
            }
            if (["segment", "no_reply", "date", "inactive"].includes(trigger.type)) {
              await db.rpc("enqueue_job", {
                _account: caller.accountId,
                _kind: "automation.scan",
                _payload: {},
                _dedupe: "automation.scan",
              });
            }
            return h.json({ ok: true, resumed: (paused ?? []).length });
          }

          if (body.action === "pause") {
            await db
              .from("automations")
              .update({ status: "paused" })
              .eq("id", auto.id)
              .eq("account_id", caller.accountId);
            await db
              .from("automation_runs")
              .update({ status: "paused" })
              .eq("automation_id", auto.id)
              .in("status", ["running", "waiting"]);
            return h.json({ ok: true });
          }

          if (body.action === "enroll") {
            if (auto.status !== "active")
              throw new h.HttpError(
                409,
                "Ative a automação antes de inscrever contatos",
                "not_active",
              );
            let ids: string[] = [];
            if (Array.isArray(body.contactIds)) ids = body.contactIds.filter(h.isUuid);
            // Lote e segmento são de gestor; atendente e vendedor inscrevem um contato por vez.
            const { enrollScopeError } = await import("@/backend/contact-trust");
            const scopeError = enrollScopeError(caller.role, {
              contactIds: new Set(ids).size + (h.isUuid(body.dealId) ? 1 : 0),
              usesSegment: h.isUuid(body.segmentId),
            });
            if (scopeError) throw new h.HttpError(403, scopeError, "forbidden");
            await h.rateLimit(
              `automations:enroll:${caller.accountId}:${caller.userId}`,
              30,
              3600,
              "Muitas inscrições em pouco tempo. Tente de novo em alguns minutos.",
            );
            if (h.isUuid(body.segmentId)) {
              const { data: seg } = await db
                .from("segments")
                .select("filter")
                .eq("id", body.segmentId)
                .eq("account_id", caller.accountId)
                .maybeSingle();
              if (seg && isSegmentFilter(seg.filter)) {
                const { data } = await applySegment(
                  db.from("contacts").select("id").eq("account_id", caller.accountId),
                  seg.filter,
                ).limit(5000);
                ids.push(...(data ?? []).map((c) => c.id));
              }
            }
            let dealId: string | null = null;
            if (h.isUuid(body.dealId)) {
              const { data: deal } = await db
                .from("deals")
                .select("id, contact_id")
                .eq("id", body.dealId)
                .eq("account_id", caller.accountId)
                .maybeSingle();
              if (deal?.contact_id) {
                ids.push(deal.contact_id);
                dealId = deal.id;
              }
            }
            // Vendedor só inscreve contatos que ele vê (dele ou sem dono).
            if (caller.role === "seller" && ids.length) {
              const { data: own } = await db
                .from("contacts")
                .select("id, owner_user_id")
                .eq("account_id", caller.accountId)
                .in("id", ids.slice(0, 1000));
              ids = (own ?? [])
                .filter((c) => !c.owner_user_id || c.owner_user_id === caller.userId)
                .map((c) => c.id);
            } else if (ids.length) {
              const { data: own } = await db
                .from("contacts")
                .select("id")
                .eq("account_id", caller.accountId)
                .in("id", ids.slice(0, 5000));
              ids = (own ?? []).map((c) => c.id);
            }
            if (ids.length === 0)
              throw new h.HttpError(400, "Nenhum contato para inscrever", "empty");
            const r = await rt.enroll(auto, ids, {
              source: dealId ? "negócio" : body.segmentId ? "segmento" : "manual",
              userId: caller.userId,
              dealId,
            });
            return h.json(r);
          }

          if (body.action === "preview") {
            if (trigger.type === "segment" && trigger.segment_id) {
              const { data: seg } = await db
                .from("segments")
                .select("filter, name")
                .eq("id", trigger.segment_id)
                .eq("account_id", caller.accountId)
                .maybeSingle();
              if (!seg || !isSegmentFilter(seg.filter))
                return h.json({ count: 0, label: "Segmento não encontrado" });
              const { count } = await applySegment(
                db
                  .from("contacts")
                  .select("id", { count: "exact", head: true })
                  .eq("account_id", caller.accountId),
                seg.filter,
              );
              return h.json({
                count: count ?? 0,
                label: `pessoas no segmento "${seg.name}" agora`,
              });
            }
            if (trigger.type === "event" && trigger.event) {
              const { count } = await db
                .from("domain_events")
                .select("id", { count: "exact", head: true })
                .eq("account_id", caller.accountId)
                .eq("type", trigger.event)
                .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
              return h.json({
                count: count ?? 0,
                label: "vezes que este gatilho aconteceu nos últimos 7 dias",
              });
            }
            if (trigger.type === "no_reply") {
              const cutoff = new Date(
                Date.now() - Math.max(1, Number(trigger.hours ?? 24)) * 3600_000,
              ).toISOString();
              const { count } = await db
                .from("conversations")
                .select("id", { count: "exact", head: true })
                .eq("account_id", caller.accountId)
                .in("status", ["open", "pending"])
                .lt("last_message_at", cutoff);
              return h.json({
                count: count ?? 0,
                label: "conversas paradas há mais tempo que o limite",
              });
            }
            return h.json({
              count: null,
              label: "Inscrição manual: escolha os contatos na lista ou no negócio",
            });
          }

          if (body.action === "simulate") {
            if (!h.isUuid(body.contactId))
              throw new h.HttpError(400, "Escolha um contato de teste", "bad_contact");
            const { data: contact } = await db
              .from("contacts")
              .select("*")
              .eq("id", body.contactId)
              .eq("account_id", caller.accountId)
              .maybeSingle();
            if (!contact) throw new h.HttpError(404, "Contato não encontrado", "not_found");
            const errors = engine.validateGraph(graph);
            const fakeRun = {
              id: "simulacao",
              enrolled_at: new Date().toISOString(),
              deal_id: null,
            } as unknown as import("@/backend/automations/runtime.server").Run;
            const facts = await rt.buildFacts(fakeRun, contact);
            const consentCache = new Map<string, boolean>();
            for (const ch of ["email", "whatsapp", "sms", "voice"]) {
              const { data } = await db.rpc("can_contact", { _contact: contact.id, _channel: ch });
              consentCache.set(ch, data !== false);
            }
            const { data: account } = await db
              .from("accounts")
              .select("timezone")
              .eq("id", caller.accountId)
              .single();
            const guards = { ...engine.DEFAULT_GUARDS, ...((auto.guards ?? {}) as object) };
            const steps: {
              node: string;
              type: string;
              label: string;
              message: string;
              at: string;
            }[] = [];
            let nodeId = graph.start;
            let now = new Date();
            let context: Record<string, unknown> = {};
            let sent = 0;
            for (let i = 0; i < 40 && nodeId; i++) {
              const node = graph.nodes[nodeId];
              if (!node) break;
              const plan = engine.planStep(node, {
                now,
                tz: account?.timezone || "America/Sao_Paulo",
                runId: "simulacao",
                guards,
                facts,
                sentThisWeek: sent,
                consent: (c) => consentCache.get(c) ?? false,
                runContext: context,
              });
              context = { ...context, ...plan.contextPatch };
              if (plan.action?.kind === "send") sent += 1;
              steps.push({
                node: node.id,
                type: node.type,
                label: engine.NODE_LABEL[node.type],
                message: plan.log.message,
                at: now.toISOString(),
              });
              if (plan.status === "done") break;
              if (plan.status === "wait")
                now =
                  plan.at.getTime() > now.getTime() ? plan.at : new Date(now.getTime() + 60_000);
              // Na simulação, a espera por evento vence pelo prazo (o evento não acontece).
              if (plan.next === node.id && node.type === "wait_event")
                context[`wait_${node.id}`] = new Date(0).toISOString();
              nodeId = plan.next;
            }
            return h.json({
              errors,
              exit: engine.checkExit(
                { ...engine.DEFAULT_EXIT, ...((auto.exit_rules ?? {}) as object) },
                facts,
              ),
              steps,
            });
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
