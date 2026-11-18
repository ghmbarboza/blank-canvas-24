import { createFileRoute } from "@tanstack/react-router";

// Envio público de formulário: anti-spam (honeypot + limite por IP + Turnstile opcional da conta;
// envio rápido demais só marca o envio como suspeito, nunca descarta o lead), contato,
// consentimento com prova, atribuição e opt-in duplo do e-mail quando a conta exige.
export const Route = createFileRoute("/api/public/forms/submit")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const cap = await import("@/backend/capture.server");
        const { cleanUtm, isTooFast } = await import("@/features/forms/types");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            formId?: string;
            values?: Record<string, unknown>;
            consent?: boolean;
            utm?: Record<string, unknown>;
            referrer?: string;
            pageUrl?: string;
            visitorId?: string;
            hp?: string;
            startedAt?: number;
            source?: "form" | "landing";
            turnstileToken?: string;
          }>(req, 16 * 1024);
          if (!h.isUuid(body.formId)) throw new h.HttpError(400, "Formulário inválido", "bad_form");
          await h.rateLimit(
            `forms:submit:${body.formId}:${h.trustedIp(req)}`,
            10,
            600,
            "Muitos envios seguidos. Tente de novo em alguns minutos.",
          );
          // Robô: preencheu o campo escondido. Responde "ok" para não ensinar o robô.
          if (body.hp && body.hp.trim()) return h.json({ ok: true, message: "Recebido." });
          // Envio rápido (autopreenchimento do navegador também é rápido): grava, marcado como suspeito.
          const suspect = isTooFast(body.startedAt, Date.now());
          // Turnstile (Cloudflare) só quando a conta salvou as duas chaves em Integrações.
          const { data: owner } = await h
            .admin()
            .from("forms")
            .select("account_id")
            .eq("id", body.formId)
            .maybeSingle();
          if (owner) {
            const ts = await import("@/backend/providers/turnstile.server");
            const keys = await ts.turnstileKeys(owner.account_id);
            if (keys) {
              const check = await ts.verifyTurnstile(
                keys.secret,
                body.turnstileToken,
                cap.clientIp(req),
              );
              if (!check.ok)
                throw new h.HttpError(
                  403,
                  "Não conseguimos confirmar que você não é um robô. Tente de novo.",
                  "turnstile",
                );
            }
          }
          const values = body.values && typeof body.values === "object" ? body.values : {};
          const result = await cap.submitForm(body.formId, values, {
            ip: cap.clientIp(req),
            userAgent: req.headers.get("user-agent"),
            referrer: typeof body.referrer === "string" ? body.referrer : null,
            pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : null,
            utm: cleanUtm(body.utm),
            source: body.source === "landing" ? "landing" : "form",
            consentGranted: body.consent === true,
            suspect,
            visitorId:
              typeof body.visitorId === "string" && /^[a-z0-9-]{8,64}$/i.test(body.visitorId)
                ? body.visitorId
                : null,
          });
          const form = result.form;
          // Opt-in e envio do e-mail são enfileirados pela captura atômica no banco.
          return h.json({
            ok: true,
            message: form.success_message,
            // envio qualificado: "Escolha um horário" com o link da agenda do dono
            schedule: "schedule" in result ? (result.schedule ?? null) : null,
            redirect:
              form.redirect_url && /^https:\/\//i.test(form.redirect_url)
                ? form.redirect_url
                : null,
          });
        })(ctx);
      },
    },
  },
});
