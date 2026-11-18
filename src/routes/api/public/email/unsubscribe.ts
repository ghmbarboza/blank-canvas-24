import { createFileRoute } from "@tanstack/react-router";

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };

async function context(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("a") ?? "";
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const sig = url.searchParams.get("h");
  const messageId = url.searchParams.get("m");
  const core = await import("@/backend/email/core.server");
  const ev = await import("@/backend/email/events.server");
  const { admin } = await import("@/backend/http.server");
  const valid =
    /^[0-9a-f-]{36}$/i.test(accountId) && (await core.verifyUnsubscribe(accountId, email, sig));
  let brand = "Nexus One";
  if (valid) {
    const { data } = await admin()
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .maybeSingle();
    brand = data?.name ?? brand;
  }
  return { url, accountId, email, messageId, valid, brand, ev };
}

// Descadastro: GET só pergunta (antivírus abre links); POST assinado descadastra (botão ou one-click RFC 8058).
export const Route = createFileRoute("/api/public/email/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const c = await context(request);
        if (!c.valid) return new Response(c.ev.invalidPage(), { status: 400, headers: HTML });
        return new Response(
          c.ev.confirmPage(c.brand, c.email, `${c.url.pathname}${c.url.search}`),
          { headers: HTML },
        );
      },
      POST: async ({ request }) => {
        const c = await context(request);
        const body = await request.text();
        if (!c.valid || !c.ev.isOneClickBody(body))
          return new Response(c.ev.invalidPage(), { status: 400, headers: HTML });
        await c.ev.unsubscribe(c.accountId, c.email, c.messageId);
        return new Response(c.ev.donePage(c.brand, c.email), { headers: HTML });
      },
    },
  },
});
