import { createFileRoute } from "@tanstack/react-router";

// Retorno do OAuth do Google/Microsoft: confere o state assinado, guarda a autorização e volta
// para Ajustes › Agenda. Erro também volta para lá, com a mensagem na URL.
export const Route = createFileRoute("/api/public/oauth/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const h = await import("@/backend/http.server");
        const cal = await import("@/backend/calendar/oauth.server");
        const base = h.appBaseUrl(request);
        const back = (msg: string) =>
          Response.redirect(`${base}/ajustes?aba=agenda&erro=${encodeURIComponent(msg)}`, 302);
        const provider = params.provider;
        if (provider !== "google" && provider !== "microsoft") return back("Provedor inválido");
        const url = new URL(request.url);
        const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (denied) return back(`Conexão cancelada: ${denied.slice(0, 120)}`);
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        if (!code || !state) return back("Resposta incompleta do provedor");
        try {
          return Response.redirect(`${base}${await cal.finish(provider, code, state, base)}`, 302);
        } catch (err) {
          return back(err instanceof Error ? err.message : "Falha na conexão");
        }
      },
    },
  },
});
