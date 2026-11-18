// Notificações: no app (notify.user) e os canais extras (notify.deliver: e-mail e push no navegador).
// notify.deliver é enfileirado pelo gatilho de public.notifications conforme as preferências da pessoa.
import { admin, appBaseUrl } from "@/backend/http.server";
import { notificationEmail, pushPayload } from "@/features/notifications/delivery";

import type { JobPayloads } from "../contract";
import { registerJob } from "../registry.server";

interface NotifyPayload {
  user_id: string;
  kind?: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

registerJob("notify.user", async (job) => {
  const p = job.payload as unknown as NotifyPayload;
  if (!job.account_id || !p?.user_id || !p.title) throw new Error("payload incompleto");
  const { error } = await admin().rpc("notify_user", {
    _account: job.account_id,
    _user: p.user_id,
    _kind: p.kind ?? "info",
    _title: p.title,
    ...(p.body ? { _body: p.body } : {}),
    ...(p.link ? { _link: p.link } : {}),
  });
  if (error) throw new Error(error.message);
});

async function deliverEmail(
  accountId: string,
  userId: string,
  n: { title: string; body: string | null; link: string | null },
): Promise<string> {
  const { data: u } = await admin().auth.admin.getUserById(userId);
  const to = u.user?.email;
  if (!to) return "sem e-mail";
  const { sendEmail } = await import("@/backend/email/core.server");
  const mail = notificationEmail(n, appBaseUrl());
  try {
    const r = await sendEmail({
      accountId,
      kind: "transactional",
      category: "transactional",
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      userId,
    });
    return r.status === "sent" ? "enviado" : (r.reason ?? r.status);
  } catch (err) {
    // Conta sem Resend conectado: o e-mail é pulado sem derrubar o job (o push segue).
    return `pulado: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
  }
}

registerJob("notify.deliver", async (job) => {
  const p = job.payload as unknown as JobPayloads["notify.deliver"];
  const { data: n } = await admin()
    .from("notifications")
    .select("id, account_id, user_id, kind, title, body, link")
    .eq("id", p.notification_id)
    .maybeSingle();
  if (!n) return { skipped: "notificação não existe" };
  const out: Record<string, unknown> = {};
  if (p.email) out["email"] = await deliverEmail(n.account_id, n.user_id, n);
  if (p.push) {
    const { sendPushToUser } = await import("@/backend/push/send.server");
    out["push"] = await sendPushToUser(n.user_id, pushPayload(n, appBaseUrl()));
  }
  return out;
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
