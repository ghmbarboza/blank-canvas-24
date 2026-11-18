import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { callApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import type { Channels, PrefRow } from "./delivery";

const key = (accountId: string, userId: string | undefined) => [
  "notification-prefs",
  accountId,
  userId,
];

export function useNotificationPrefs(accountId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: key(accountId, user?.id),
    enabled: Boolean(user),
    queryFn: async (): Promise<PrefRow[]> => {
      const { data, error } = await supabase
        .from("notification_prefs")
        .select("kind, app, email, push")
        .eq("account_id", accountId)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveNotificationPref(accountId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, channels }: { kind: string; channels: Channels }) => {
      const { error } = await supabase
        .from("notification_prefs")
        .upsert(
          { account_id: accountId, user_id: user!.id, kind, ...channels },
          { onConflict: "account_id,user_id,kind" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(accountId, user?.id) }),
  });
}

export function useResetNotificationPref(accountId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: string) => {
      const { error } = await supabase
        .from("notification_prefs")
        .delete()
        .eq("account_id", accountId)
        .eq("user_id", user!.id)
        .eq("kind", kind);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(accountId, user?.id) }),
  });
}

// ───────────────────────── push no navegador ─────────────────────────
export type PushState = "unsupported" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function usePushState() {
  return useQuery({
    queryKey: ["push-state"],
    queryFn: async (): Promise<PushState> => {
      if (!pushSupported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      return (await currentSubscription()) ? "on" : "off";
    },
  });
}

export function useEnablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!pushSupported()) throw new Error("Este navegador não aceita avisos");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Você não liberou os avisos no navegador");
      const res = await fetch("/api/push");
      const body = (await res.json().catch(() => null)) as {
        publicKey?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.publicKey) throw new Error(body?.error ?? "Push indisponível");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(body.publicKey),
        }));
      const j = sub.toJSON();
      const { error } = await supabase.rpc("register_push_subscription", {
        _endpoint: sub.endpoint,
        _p256dh: j.keys?.["p256dh"] ?? "",
        _auth: j.keys?.["auth"] ?? "",
        _user_agent: navigator.userAgent.slice(0, 300),
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["push-state"] }),
  });
}

export function useDisablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const sub = await currentSubscription();
      if (!sub) return;
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["push-state"] }),
  });
}

export function useSendTestNotification(accountId: string) {
  return useMutation({
    mutationFn: () => callApi<{ ok: true }>("/api/push", { accountId, action: "test" }),
  });
}
