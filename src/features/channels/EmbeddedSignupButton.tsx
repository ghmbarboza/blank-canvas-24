import { useEffect, useRef, useState } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";

import { channelsKey } from "./api";

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
}
interface FbSdk {
  init: (o: {
    appId: string;
    version: string;
    xfbml?: boolean;
    autoLogAppEvents?: boolean;
  }) => void;
  login: (cb: (r: FbLoginResponse) => void, o: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    FB?: FbSdk;
  }
}

interface Config {
  ready: boolean;
  appId?: string;
  configId?: string;
}

const SDK_SRC = "https://connect.facebook.net/pt_BR/sdk.js";
const GRAPH_VERSION = "v21.0";

function loadSdk(appId: string): Promise<FbSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => {
      if (!window.FB) return reject(new Error("SDK da Meta não carregou"));
      window.FB.init({ appId, version: GRAPH_VERSION, xfbml: false, autoLogAppEvents: true });
      resolve(window.FB);
    };
    s.onerror = () => reject(new Error("SDK da Meta bloqueado pelo navegador"));
    document.body.appendChild(s);
  });
}

// Cadastro Incorporado da Meta: o cliente entra com o Facebook, escolhe ou cria a WABA e o número,
// e a Meta devolve (por postMessage) o phone_number_id e o waba_id; o code vem no callback do login.
export function EmbeddedSignupButton({
  accountId,
  onConnected,
}: {
  accountId: string;
  onConnected: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const session = useRef<{ phone?: string; waba?: string }>({});
  const config = useQuery({
    queryKey: ["meta-embedded-config", accountId],
    queryFn: () => callApi<Config>("/api/channels/meta-embedded", { accountId, action: "config" }),
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)?facebook\.com$/.test(ev.origin)) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d.event === "FINISH" || d.event === "FINISH_ONLY_WABA")
          session.current = { phone: d.data?.phone_number_id, waba: d.data?.waba_id };
        if (d.event === "CANCEL") setBusy(false);
      } catch {
        /* mensagem de outra origem do SDK, sem JSON */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!config.data?.ready) return null;

  async function start() {
    const cfg = config.data!;
    setBusy(true);
    session.current = {};
    try {
      const fb = await loadSdk(cfg.appId!);
      fb.login(
        (r) => {
          const code = r.authResponse?.code;
          if (!code) {
            setBusy(false);
            return;
          }
          // o postMessage com número e WABA chega antes ou logo depois do callback
          setTimeout(() => void finish(code), 600);
        },
        {
          config_id: cfg.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
        },
      );
    } catch (err) {
      setBusy(false);
      toast.error(errorMessage(err));
    }
  }

  async function finish(code: string) {
    try {
      const { phone, waba } = session.current;
      if (!phone || !waba)
        throw new Error("A Meta não informou o número escolhido. Tente de novo.");
      const r = await callApi<{ name: string | null; phone: string | null }>(
        "/api/channels/meta-embedded",
        { accountId, action: "connect", code, phoneNumberId: phone, wabaId: waba },
      );
      toast.success(`WhatsApp oficial conectado${r.phone ? `: ${r.phone}` : ""}`);
      await qc.invalidateQueries({ queryKey: channelsKey(accountId) });
      onConnected();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[13px] font-semibold">Conectar em 1 clique</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Entre com o Facebook da empresa, escolha o número e pronto: token, webhook e registro do
        número ficam por nossa conta.
      </p>
      <Button className="mt-3" onClick={() => void start()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <BrandIcon id="facebook" size={16} />} Entrar
        com o Facebook
      </Button>
    </div>
  );
}
