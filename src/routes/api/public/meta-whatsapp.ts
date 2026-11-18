import { createFileRoute } from "@tanstack/react-router";

// Webhook ÚNICO do app da Meta da plataforma (números conectados em 1 clique). Confere a assinatura
// com o App Secret da plataforma e repassa o mesmo corpo, com a mesma assinatura, para a função
// webhook-whatsapp de cada canal (?c=), que já sabe processar mensagens e status.
export const Route = createFileRoute("/api/public/meta-whatsapp")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        const me = await import("@/backend/meta-embedded.server");
        return h.handle(async (req) => {
          const url = new URL(req.url);
          const m = await me.platformMeta();
          const ok =
            url.searchParams.get("hub.mode") === "subscribe" &&
            Boolean(m.verify_token) &&
            h.safeEqual(url.searchParams.get("hub.verify_token") ?? "", m.verify_token!);
          if (!ok) throw new h.HttpError(403, "Token de verificação inválido", "forbidden");
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const me = await import("@/backend/meta-embedded.server");
        const { createHmac } = await import("node:crypto");
        return h.handle(async (req) => {
          const raw = await req.text();
          const m = await me.platformMeta();
          if (!m.app_secret)
            throw new h.HttpError(409, "App da Meta não configurado", "not_configured");
          const header = req.headers.get("x-hub-signature-256") ?? "";
          const expected = `sha256=${createHmac("sha256", m.app_secret).update(raw).digest("hex")}`;
          if (!header || !h.safeEqual(header, expected))
            throw new h.HttpError(401, "Assinatura inválida", "bad_signature");

          let body: {
            entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[];
          };
          try {
            body = JSON.parse(raw);
          } catch {
            throw new h.HttpError(400, "JSON inválido", "bad_json");
          }
          const phones = [
            ...new Set(
              (body.entry ?? []).flatMap((e) =>
                (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id ?? ""),
              ),
            ),
          ].filter((p) => /^\d{6,20}$/.test(p));
          const channels = await me.channelsForPhones(phones);
          const base = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
          const results = await Promise.allSettled(
            channels.map((ch) =>
              fetch(`${base}/functions/v1/webhook-whatsapp?c=${ch.id}`, {
                method: "POST",
                headers: { "content-type": "application/json", "x-hub-signature-256": header },
                body: raw,
                signal: AbortSignal.timeout(10_000),
              }),
            ),
          );
          // a Meta reenvia se não receber 200; falha de um canal não pode travar os outros
          return h.json({
            ok: true,
            forwarded: results.filter((r) => r.status === "fulfilled" && r.value.ok).length,
            channels: channels.length,
          });
        })(ctx);
      },
    },
  },
});
