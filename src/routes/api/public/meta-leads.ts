import { createFileRoute } from "@tanstack/react-router";

// Webhook do Meta Lead Ads: /api/public/meta-leads?account=<id>&form=<formulário do Nexus que recebe>
// GET verifica (hub.verify_token); POST confere x-hub-signature-256 com o app secret e busca o lead na Graph API.
export const Route = createFileRoute("/api/public/meta-leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const h = await import("@/backend/http.server");
        const { admin, isUuid } = h;
        const { getIntegration } = await import("@/backend/integrations.server");
        const url = new URL(request.url);
        const account = url.searchParams.get("account");
        if (!isUuid(account)) return new Response("conta inválida", { status: 400 });
        const it = await getIntegration(account, "meta_leads");
        const expected = it?.secrets["verify_token"];
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          expected &&
          h.safeEqual(url.searchParams.get("hub.verify_token") ?? "", expected)
        ) {
          await admin()
            .from("account_integrations")
            .update({ status: "connected", last_error: null })
            .eq("account_id", account)
            .eq("provider", "meta_leads");
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("verificação recusada", { status: 403 });
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { getIntegration } = await import("@/backend/integrations.server");
        const cap = await import("@/backend/capture.server");
        const { createHmac, timingSafeEqual } = await import("node:crypto");
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
          const raw = await req.text();
          const it = await getIntegration(account, "meta_leads");
          const appSecret = it?.secrets["app_secret"];
          const pageToken = it?.secrets["page_token"];
          if (!appSecret || !pageToken)
            throw new h.HttpError(409, "Integração Meta Lead Ads incompleta", "not_configured");
          const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
          const expected = createHmac("sha256", appSecret).update(raw).digest("hex");
          if (
            !sig ||
            sig.length !== expected.length ||
            !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
          )
            throw new h.HttpError(401, "Assinatura inválida", "bad_signature");
          const { data: form } = await h
            .admin()
            .from("forms")
            .select("id, account_id, fields")
            .eq("id", formId)
            .eq("account_id", account)
            .maybeSingle();
          if (!form) throw new h.HttpError(404, "Formulário do Nexus não encontrado", "not_found");
          const payload = JSON.parse(raw) as {
            entry?: {
              changes?: {
                field?: string;
                value?: {
                  leadgen_id?: string;
                  ad_id?: string;
                  form_id?: string;
                  campaign_id?: string;
                  adgroup_id?: string;
                };
              }[];
            }[];
          };
          const fields = (form.fields as unknown as { key: string; map: string | null }[]) ?? [];
          let processed = 0;
          for (const entry of payload.entry ?? []) {
            for (const ch of entry.changes ?? []) {
              if (ch.field !== "leadgen" || !ch.value?.leadgen_id) continue;
              const res = await fetch(
                `https://graph.facebook.com/v21.0/${ch.value.leadgen_id}?access_token=${encodeURIComponent(pageToken)}`,
                { signal: AbortSignal.timeout(10_000) },
              );
              const lead = (await res.json().catch(() => ({}))) as {
                field_data?: { name: string; values: string[] }[];
                error?: { message: string };
              };
              if (!res.ok) throw new Error(`Graph API: ${lead.error?.message ?? res.status}`);
              // Campos do anúncio → chaves do formulário do Nexus (por nome igual ou pelo mapeamento padrão da Meta).
              const values: Record<string, string> = {};
              const alias: Record<string, string> = {
                full_name: "name",
                email: "email",
                phone_number: "phone",
                company_name: "company",
                job_title: "job_title",
                city: "city",
              };
              for (const fd of lead.field_data ?? []) {
                const v = fd.values?.[0] ?? "";
                const direct = fields.find((f) => f.key === fd.name);
                const mapped = fields.find((f) => f.map === alias[fd.name]);
                const target = direct ?? mapped;
                if (target) values[target.key] = v;
              }
              await cap.submitForm(form.id, values, {
                ip: null,
                userAgent: "meta-lead-ads",
                referrer: null,
                pageUrl: null,
                utm: {
                  utm_source: "facebook",
                  utm_medium: "paid",
                  ...(ch.value.campaign_id ? { utm_campaign: ch.value.campaign_id } : {}),
                  ...(ch.value.ad_id ? { utm_content: ch.value.ad_id } : {}),
                },
                source: "meta_ads",
                externalId: ch.value.leadgen_id,
                consentGranted: true,
              });
              processed += 1;
            }
          }
          return h.json({ ok: true, processed });
        })(ctx);
      },
    },
  },
});
