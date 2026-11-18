import { createFileRoute } from "@tanstack/react-router";

// Webhook dos formulários de lead do Google Ads:
// /api/public/google-leads?account=<conta>&form=<formulário do Nexus que recebe>
// O Google manda a "chave" do formulário em google_key; ela tem de bater com a chave salva em
// Integrações › Google Ads (formulários de lead). Lead de teste (is_test) só confirma a ligação.
export const Route = createFileRoute("/api/public/google-leads")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { getIntegration } = await import("@/backend/integrations.server");
        const cap = await import("@/backend/capture.server");
        const gl = await import("@/features/forms/google-leads");
        return h.handle(async (req) => {
          const url = new URL(req.url);
          const account = url.searchParams.get("account");
          const formId = url.searchParams.get("form");
          if (!h.isUuid(account) || !h.isUuid(formId))
            throw new h.HttpError(
              400,
              "Informe ?account= e ?form= na URL do webhook",
              "bad_params",
            );
          await h.rateLimit(`google-leads:${account}`, 120, 60);
          const lead = gl.parseGoogleLead(await h.readJson<unknown>(req, 64 * 1024));
          if (!lead) throw new h.HttpError(400, "Lead fora do formato do Google Ads", "bad_lead");
          const it = await getIntegration(account, "google_leads");
          const expected = it?.secrets["webhook_key"];
          if (!expected)
            throw new h.HttpError(409, "Integração do Google Ads sem chave", "not_configured");
          if (!h.safeEqual(lead.googleKey, expected))
            throw new h.HttpError(401, "Chave do webhook inválida", "bad_key");
          const db = h.admin();
          await db
            .from("account_integrations")
            .update({ status: "connected", last_error: null })
            .eq("account_id", account)
            .eq("provider", "google_leads");
          if (lead.isTest) return h.json({ ok: true, test: true });

          const { data: form } = await db
            .from("forms")
            .select("id, fields")
            .eq("id", formId)
            .eq("account_id", account)
            .maybeSingle();
          if (!form) throw new h.HttpError(404, "Formulário do Nexus não encontrado", "not_found");
          const fields = (form.fields as unknown as { key: string; map: string | null }[]) ?? [];
          const result = await cap.submitForm(
            form.id,
            gl.mapGoogleLeadToForm(lead.columns, fields),
            {
              ip: null,
              userAgent: "google-lead-forms",
              referrer: null,
              pageUrl: null,
              utm: gl.googleLeadUtm(lead),
              source: "google_ads",
              externalId: lead.leadId,
              // quem preenche o formulário do anúncio aceitou a política de privacidade do anunciante
              consentGranted: true,
            },
          );
          return h.json({ ok: true, duplicated: result.duplicated });
        })(ctx);
      },
    },
  },
});
