import { createFileRoute } from "@tanstack/react-router";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) =>
  c.charCodeAt(0),
);

// Pixel de abertura: registra a abertura e devolve um GIF transparente de 1x1, sem cache.
export const Route = createFileRoute("/api/public/email/o/$id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).pathname.split("/").pop() ?? "";
        try {
          const { trackOpen } = await import("@/backend/email/events.server");
          await trackOpen(
            id.replace(/\.gif$/, ""),
            request.headers.get("user-agent"),
            request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
          );
        } catch (err) {
          console.error("[email] pixel", err);
        }
        return new Response(GIF, {
          headers: {
            "content-type": "image/gif",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      },
    },
  },
});
