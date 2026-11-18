// Envio de Web Push para todos os navegadores inscritos de uma pessoa. Chaves VAPID no Vault
// (public.platform_vapid, só service role). Inscrição morta (404/410) é apagada; falha conta tentativa.
import { admin } from "@/backend/http.server";

import { buildPushRequest, isGone, type VapidKeys } from "./webpush";

let cached: VapidKeys | null = null;

export async function vapidKeys(): Promise<VapidKeys | null> {
  if (cached) return cached;
  const { data, error } = await admin().rpc("platform_vapid");
  const v = (data ?? {}) as { public?: string | null; private?: string | null };
  if (error || !v.public || !v.private) return null;
  cached = {
    publicKey: v.public,
    privateKey: v.private,
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:suporte@viverdeia.ai",
  };
  return cached;
}

export interface PushMessage {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string;
}

export async function sendPushToUser(
  userId: string,
  msg: PushMessage,
): Promise<{ sent: number; removed: number; failed: number }> {
  const db = admin();
  const keys = await vapidKeys();
  if (!keys) return { sent: 0, removed: 0, failed: 0 };
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, fail_count")
    .eq("user_id", userId);
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const s of subs ?? []) {
    try {
      const req = await buildPushRequest(s, msg, keys);
      const res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: req.body.slice().buffer as ArrayBuffer,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        sent++;
        await db
          .from("push_subscriptions")
          .update({ fail_count: 0, last_success_at: new Date().toISOString() })
          .eq("id", s.id);
      } else if (isGone(res.status)) {
        removed++;
        await db.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        failed++;
        console.warn("[push] recusado", res.status, await res.text().catch(() => ""));
        await db
          .from("push_subscriptions")
          .update({ fail_count: s.fail_count + 1 })
          .eq("id", s.id);
      }
    } catch (err) {
      failed++;
      console.warn("[push] falhou", err instanceof Error ? err.message : err);
    }
  }
  return { sent, removed, failed };
}
