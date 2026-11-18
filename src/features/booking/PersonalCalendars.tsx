import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { BrandTile } from "@/components/brand/BrandIcon";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/features/integrations/api";
import { supabase } from "@/integrations/supabase/client";
import { callApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

type Provider = "google" | "microsoft";
const PROVIDERS: { id: Provider; name: string; app: string }[] = [
  { id: "google", name: "Google Agenda", app: "Google Cloud (OAuth)" },
  { id: "microsoft", name: "Outlook / Microsoft 365", app: "Azure (Microsoft Entra)" },
];

function useMyConnections(accountId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["calendar-connections", accountId, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_connections")
        .select("provider, email, status, last_sync_at, last_error")
        .eq("account_id", accountId)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Conexão da agenda pessoal: bloqueia nos links o que está ocupado lá e grava as reuniões lá.
export function PersonalCalendars({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const conns = useMyConnections(accountId);
  const google = useIntegration(accountId, "google");
  const microsoft = useIntegration(accountId, "microsoft");
  // app OAuth cadastrado = Client ID salvo e secret no cofre
  const ready = (d: typeof google.data) =>
    Boolean(d?.config["client_id"] && d.secrets["client_secret"]);
  const appReady = { google: ready(google.data), microsoft: ready(microsoft.data) };

  // volta do OAuth: ?conectado=google ou ?erro=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ok = q.get("conectado");
    const err = q.get("erro");
    if (!ok && !err) return;
    if (ok) toast.success(`Agenda ${ok === "google" ? "do Google" : "do Outlook"} conectada`);
    if (err) toast.error(err);
    q.delete("conectado");
    q.delete("erro");
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, []);

  const start = useMutation({
    mutationFn: (provider: Provider) =>
      callApi<{ url: string }>("/api/calendar", { accountId, action: "start", provider }),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: (provider: Provider) =>
      callApi<{ ok: boolean }>("/api/calendar", { accountId, action: "disconnect", provider }),
    onSuccess: () => {
      toast.success("Agenda desconectada");
      void qc.invalidateQueries({ queryKey: ["calendar-connections", accountId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {PROVIDERS.map((p) => {
        const c = (conns.data ?? []).find((x) => x.provider === p.id);
        const busy = start.isPending && start.variables === p.id;
        return (
          <li key={p.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2">
              <BrandTile id={p.id === "google" ? "googlecalendar" : "microsoft"} size={32} />
              <span className="flex-1 text-[14px] font-medium">{p.name}</span>
              {c?.status === "connected" && (
                <CheckCircle2 className="size-4 text-foreground" aria-label="Conectada" />
              )}
              {c?.status === "error" && (
                <TriangleAlert className="size-4 text-danger" aria-label="Com erro" />
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">
              {c
                ? c.status === "error"
                  ? `Parou de sincronizar: ${c.last_error ?? "reconecte"}`
                  : `${c.email ?? "Conectada"}${c.last_sync_at ? ` · última gravação ${formatRelative(c.last_sync_at)}` : ""}`
                : appReady[p.id]
                  ? "Os horários ocupados somem dos seus links e as reuniões marcadas aparecem lá."
                  : `Um administrador precisa cadastrar o app do ${p.app} em Ajustes › Integrações.`}
            </p>
            <div className="flex gap-2">
              {(!c || c.status === "error") && (
                <Button
                  size="sm"
                  variant={c ? "default" : "outline"}
                  disabled={!appReady[p.id] || busy}
                  onClick={() => start.mutate(p.id)}
                >
                  {busy && <Loader2 className="animate-spin" />} {c ? "Reconectar" : "Conectar"}
                </Button>
              )}
              {c && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate(p.id)}
                >
                  Desconectar
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
