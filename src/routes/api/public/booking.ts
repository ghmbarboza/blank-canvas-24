import { createFileRoute } from "@tanstack/react-router";

// Agendamento público (sem login): dados da página, horários livres e reserva. Limite por IP.
export const Route = createFileRoute("/api/public/booking")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        const b = await import("@/backend/booking.server");
        const { createHash } = await import("node:crypto");
        return h.handle(async (req) => {
          const body = await h.readJson<{
            action?: "page" | "slots" | "book";
            slug?: string;
            start?: string;
            name?: string;
            email?: string;
            phone?: string;
            answers?: Record<string, unknown>;
            consent?: boolean;
            website?: string; // honeypot
          }>(req, 8 * 1024);
          const ip = req.headers.get("cf-connecting-ip") ?? "anon";
          const ipHash = createHash("sha256")
            .update(`nexus-booking:${ip}`)
            .digest("hex")
            .slice(0, 32);
          const limit = body.action === "book" ? 8 : 120;
          const { data: allowed } = await h.admin().rpc("hit_rate_limit", {
            _key: `booking:${body.action}:${ipHash}`,
            _max: limit,
            _window_seconds: 3600,
          });
          if (allowed === false)
            throw new h.HttpError(
              429,
              "Muitas tentativas. Tente de novo em alguns minutos.",
              "rate_limited",
            );
          const slug = String(body.slug ?? "").toLowerCase();

          if (body.action === "page") {
            const { page, accountName, timeZone } = await b.loadPage(slug);
            let host: { name: string | null; avatar_url: string | null } | null = null;
            if (page.owner_user_id) {
              const { data } = await h
                .admin()
                .from("profiles")
                .select("full_name, avatar_url")
                .eq("id", page.owner_user_id)
                .maybeSingle();
              host = data ? { name: data.full_name, avatar_url: data.avatar_url } : null;
            }
            return h.json({
              title: page.title,
              description: page.description,
              duration_min: page.duration_min,
              questions: page.questions,
              location: page.location,
              location_detail: page.location === "nexus_meet" ? null : page.location_detail,
              account_name: accountName,
              time_zone: timeZone,
              host,
            });
          }
          if (body.action === "slots") return h.json(await b.freeSlots(slug));
          if (body.action === "book") {
            if (body.website) throw new h.HttpError(400, "Envio inválido", "bot");
            const name = String(body.name ?? "").trim();
            const email = String(body.email ?? "").trim();
            const phone = String(body.phone ?? "").trim();
            if (name.length < 2) throw new h.HttpError(422, "Informe seu nome", "name");
            if (!email && !phone)
              throw new h.HttpError(422, "Informe e-mail ou WhatsApp", "contact");
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
              throw new h.HttpError(422, "E-mail inválido", "email");
            if (phone && phone.replace(/\D/g, "").length < 10)
              throw new h.HttpError(422, "WhatsApp com DDD", "phone");
            // convite vai para o contato informado: limite por destinatário evita spam por procuração
            await h.rateLimit(
              `booking:to:${(email || phone.replace(/\D/g, "")).toLowerCase()}`,
              3,
              3600,
            );
            const answers = Object.fromEntries(
              Object.entries(body.answers ?? {})
                .filter(([k]) => /^[a-z0-9_-]{1,40}$/i.test(k))
                .map(([k, v]) => [k, String(v ?? "").slice(0, 1000)]),
            );
            const result = await b.book({
              slug,
              start: String(body.start ?? ""),
              name,
              email: email || null,
              phone: phone || null,
              answers,
              consent: Boolean(body.consent),
              ip: ipHash,
              userAgent: req.headers.get("user-agent") ?? "",
            });
            return h.json(result, 201);
          }
          throw new h.HttpError(400, "Ação inválida", "bad_action");
        })(ctx);
      },
    },
  },
});
