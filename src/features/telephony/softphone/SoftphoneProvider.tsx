import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";

import { telephonyApi, type Call } from "../api";
import { SoftphoneContext, type DialTarget, type SoftphoneState } from "./softphone-context";

// Script oficial do widget WebRTC da Zadarma. A versão fica aqui para trocar num lugar só.
const ZADARMA_WIDGET = "https://my.zadarma.com/webphoneWebRTCWidget/v9/js";

declare global {
  interface Window {
    zadarmaWidgetFn?: (
      key: string,
      sip: string,
      shape: string,
      lang: string,
      visible: boolean,
      pos: Record<string, string>,
    ) => void;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Não carregou ${src}`));
    document.head.appendChild(s);
  });
}

// Telefone do vendedor, global no app: carrega o widget da Zadarma sob demanda, disca pelo
// callback (toca o ramal do vendedor e depois o cliente) e acompanha a ligação em tempo real.
export function SoftphoneProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [widget, setWidget] = useState<SoftphoneState["widget"]>("off");
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [dialing, setDialing] = useState(false);
  const [target, setTarget] = useState<DialTarget | null>(null);
  const loading = useRef(false);

  const active = useQuery({
    queryKey: ["softphone-active", accountId, user?.id],
    enabled: Boolean(user),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user!.id)
        .in("status", ["ringing", "in_progress"])
        .gte("started_at", new Date(Date.now() - 3 * 3_600_000).toISOString())
        .order("started_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`softphone-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `user_id=eq.${user.id}` },
        () => void qc.invalidateQueries({ queryKey: ["softphone-active", accountId, user.id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, accountId, qc]);

  const loadWidget = useCallback(async () => {
    if (loading.current || widget === "ready") return;
    loading.current = true;
    setWidget("loading");
    setWidgetError(null);
    try {
      const { key, sip } = await telephonyApi.webrtcKey(accountId);
      await loadScript(`${ZADARMA_WIDGET}/loader-phone-lib.js?sub_v=1`);
      await loadScript(`${ZADARMA_WIDGET}/loader-phone-fn.js?sub_v=1`);
      if (!window.zadarmaWidgetFn) throw new Error("O widget da Zadarma não respondeu");
      window.zadarmaWidgetFn(key, sip, "rounded", "pt", true, { left: "84px", bottom: "16px" });
      setWidget("ready");
    } catch (err) {
      setWidget("error");
      setWidgetError(errorMessage(err));
    } finally {
      loading.current = false;
    }
  }, [accountId, widget]);

  const dial = useCallback(
    async (t: DialTarget, via: "softphone" | "mobile" = "softphone") => {
      setTarget(t);
      setOpen(true);
      setDialing(true);
      try {
        if (via === "softphone" && widget !== "ready") await loadWidget();
        const r = await telephonyApi.callback(accountId, {
          contactId: t.contactId ?? null,
          phone: t.phone ?? null,
          via,
        });
        toast.success(
          via === "mobile"
            ? "Seu celular vai tocar; ao atender, ligamos para o cliente."
            : `Atenda no telefone do navegador (${r.from}); em seguida ligamos para ${t.name ?? r.to}.`,
        );
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setDialing(false);
      }
    },
    [accountId, loadWidget, widget],
  );

  const value = useMemo<SoftphoneState>(
    () => ({
      open,
      setOpen,
      widget,
      widgetError,
      loadWidget,
      dial,
      dialing,
      target,
      activeCall: active.data ?? null,
      accountId,
    }),
    [open, widget, widgetError, loadWidget, dial, dialing, target, active.data, accountId],
  );
  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}
