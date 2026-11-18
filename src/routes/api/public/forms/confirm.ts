import { createFileRoute } from "@tanstack/react-router";

const page = (title: string, text: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:Manrope,system-ui,sans-serif;background:#f7f8fa;color:#001f35;display:grid;place-items:center;min-height:100vh}
main{max-width:420px;padding:40px 32px;background:#fff;border-radius:24px;box-shadow:0 10px 30px rgba(0, 31, 53,.08);text-align:center}
h1{font-size:22px;margin:0 0 8px}p{color:#5b6779;font-size:14px;line-height:1.5;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

// Clique de confirmação do opt-in duplo: registra o consentimento de e-mail com a prova do clique.
export const Route = createFileRoute("/api/public/forms/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { admin } = await import("@/backend/http.server");
        const { ipHash, clientIp } = await import("@/backend/capture.server");
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const html = (t: string, x: string, status = 200) =>
          new Response(page(t, x), {
            status,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        if (!/^[a-f0-9]{36}$/.test(token))
          return html("Link inválido", "Confira se copiou o link inteiro do e-mail.", 400);
        const { createHash } = await import("node:crypto");
        const db = admin();
        const { data: sub } = await db
          .from("form_submissions")
          .select("id, account_id, contact_id, confirmed_at, form_id")
          .or(
            `confirm_token_hash.eq.${createHash("sha256").update(token).digest("hex")},confirm_token.eq.${token}`,
          )
          .maybeSingle();
        if (!sub?.contact_id)
          return html(
            "Link expirado",
            "Este link não vale mais. Preencha o formulário de novo.",
            404,
          );
        const { data: confirmed, error } = await db.rpc("confirm_form_email", {
          _token: token,
          _proof: {
            ip_hash: ipHash(sub.account_id, clientIp(request)),
            user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          },
        });
        if (error) {
          console.error("[forms:confirm] não foi possível persistir a confirmação");
          return html(
            "Não deu para confirmar",
            "Tente abrir este mesmo link novamente em instantes.",
            503,
          );
        }
        if (!confirmed)
          return html(
            "Link expirado",
            "Preencha o formulário novamente para confirmar seu e-mail.",
            404,
          );
        return html(
          "E-mail confirmado",
          "Obrigado! A partir de agora você recebe nossas mensagens. Pode cancelar quando quiser pelo link no rodapé dos e-mails.",
        );
      },
    },
  },
});
