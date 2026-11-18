import { createFileRoute } from "@tanstack/react-router";

import type { SnsMessage } from "@/backend/email/sns";

// Eventos da Amazon SES via SNS: /api/public/ses?a=<conta>&t=<token do webhook da integração SES>.
// Confere o token, a assinatura da SNS (certificado de host da AWS) e grava entrega, devolução e reclamação.
export const Route = createFileRoute("/api/public/ses")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const { getIntegration } = await import("@/backend/integrations.server");
        const sns = await import("@/backend/email/sns");
        const ev = await import("@/backend/email/events.server");
        const { createVerify } = await import("node:crypto");
        return h.handle(async (req) => {
          const url = new URL(req.url);
          const account = url.searchParams.get("a");
          const token = url.searchParams.get("t") ?? "";
          if (!h.isUuid(account) || !token)
            throw new h.HttpError(400, "Informe ?a= e ?t= na URL", "bad_params");
          await h.rateLimit(`ses:${account}`, 600, 60);
          const it = await getIntegration(account, "ses");
          const expected = it?.secrets["webhook_token"];
          if (!expected || !h.safeEqual(token, expected))
            throw new h.HttpError(401, "Token do webhook inválido", "unauthorized");

          const m = JSON.parse(await req.text()) as SnsMessage;
          if (!sns.isSnsUrl(m.SigningCertURL, "cert"))
            throw new h.HttpError(400, "Certificado fora da AWS", "bad_cert");
          const pem = await fetch(m.SigningCertURL, { signal: AbortSignal.timeout(8_000) }).then(
            (r) => r.text(),
          );
          const verifier = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
          verifier.update(sns.stringToSign(m), "utf8");
          if (!verifier.verify(pem, m.Signature, "base64"))
            throw new h.HttpError(401, "Assinatura da SNS inválida", "bad_signature");

          if (m.Type === "SubscriptionConfirmation") {
            if (!sns.isSnsUrl(m.SubscribeURL, "subscribe"))
              throw new h.HttpError(400, "URL de inscrição fora da AWS", "bad_subscribe");
            await fetch(m.SubscribeURL!, { signal: AbortSignal.timeout(8_000) });
            return h.json({ ok: true, subscribed: true });
          }
          if (m.Type !== "Notification") return h.json({ ok: true, ignored: m.Type });
          const e = sns.parseSesEvent(m.Message);
          if (!e) return h.json({ ok: true, ignored: "evento sem efeito" });
          const applied = await ev.applyDeliveryEvent(
            account,
            e.providerId,
            e.kind,
            e.detail,
            "ses",
          );
          return h.json({ ok: true, applied });
        })(ctx);
      },
    },
  },
});
