import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Plus, Send, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { WEBHOOK_EVENTS } from "./webhook-events";

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
}

// API pública (chaves) e webhooks de saída assinados.
export function DevelopersTab() {
  const { current, isAdmin } = useAccount();
  const accountId = current!.accountId;
  return (
    <div className="space-y-6">
      <ApiKeys accountId={accountId} isAdmin={isAdmin} />
      <Webhooks accountId={accountId} isAdmin={isAdmin} />
    </div>
  );
}

function ApiKeys({ accountId, isAdmin }: { accountId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const keys = useQuery({
    queryKey: ["api-keys", accountId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, prefix, scopes, last_used_at, revoked_at, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_api_key", {
        _account: accountId,
        _name: name || "Integração",
      });
      if (error) throw error;
      return data as { id: string; key: string };
    },
    onSuccess: (r) => {
      setCreated(r.key);
      setName("");
      void qc.invalidateQueries({ queryKey: ["api-keys", accountId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", accountId] }),
  });
  const base = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <SettingsCard
      title="API pública"
      description="Conecte seu site, ERP ou automações. Use a chave no cabeçalho x-api-key."
      readOnlyNote={isAdmin ? undefined : "Só administradores criam chaves."}
    >
      {isAdmin && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da chave (ex.: Site, ERP)"
            aria-label="Nome da chave"
          />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Criar chave
          </Button>
        </form>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(keys.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma chave criada.
          </li>
        )}
        {(keys.data ?? []).map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-4 py-2.5">
            <KeyRound className="size-4 text-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">
                {k.name}{" "}
                {k.revoked_at && <span className="text-[11px] text-danger">· revogada</span>}
              </p>
              <p className="truncate font-mono text-[11px] text-subtle">
                {k.prefix}… ·{" "}
                {k.last_used_at ? `usada ${formatRelative(k.last_used_at)}` : "nunca usada"}
              </p>
            </div>
            {!k.revoked_at && isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(k.id)}>
                Revogar
              </Button>
            )}
          </li>
        ))}
      </ul>
      <details className="mt-4 rounded-xl bg-surface-2 p-3 text-[12px]">
        <summary className="cursor-pointer font-medium">Exemplos de uso</summary>
        <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre text-muted-foreground">{`# Criar ou atualizar um contato (casa pelo e-mail/telefone)
curl -X POST ${base}/api/v1/contacts \\
  -H "x-api-key: nx_..." -H "content-type: application/json" \\
  -d '{"name":"Ana Souza","email":"ana@empresa.com","phone":"11999990000","source":"site"}'

# Listar negócios abertos
curl "${base}/api/v1/deals?status=open&limit=50" -H "x-api-key: nx_..."`}</pre>
      </details>
      <Dialog open={Boolean(created)} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave criada</DialogTitle>
            <DialogDescription>
              Copie agora: por segurança, ela não aparece de novo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={created ?? ""} className="font-mono text-[12px]" />
            <Button variant="outline" onClick={() => created && copy(created)}>
              <Copy />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

function Webhooks({ accountId, isAdmin }: { accountId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["webhooks", accountId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: deliveries } = await supabase
        .from("webhook_deliveries")
        .select("endpoint_id, status, response_code, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []).map((e) => ({
        ...e,
        last: (deliveries ?? []).find((d) => d.endpoint_id === e.id),
      }));
    },
  });
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["contact.created", "deal.won"]);
  const [secret, setSecret] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      callApi<{ id: string; secret: string }>("/api/webhooks", {
        accountId,
        action: "create",
        url,
        events,
      }),
    onSuccess: (r) => {
      setOpen(false);
      setSecret(r.secret);
      setUrl("");
      void qc.invalidateQueries({ queryKey: ["webhooks", accountId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const ping = useMutation({
    mutationFn: (id: string) =>
      callApi<{ ok: boolean; status: number; error?: string }>("/api/webhooks", {
        accountId,
        action: "ping",
        id,
      }),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Endpoint respondeu ${r.status}`)
        : toast.error(`Falhou: ${r.error ?? r.status}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", accountId] }),
  });

  return (
    <SettingsCard
      title="Webhooks"
      description="Avisamos seu sistema quando algo acontece. Cada envio é assinado (x-vinculo-signature = HMAC-SHA256 de timestamp.corpo) e reenviado com recuo em caso de falha."
      actions={
        isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus /> Novo webhook
          </Button>
        )
      }
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhum webhook cadastrado.
          </li>
        )}
        {(list.data ?? []).map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
            <Webhook className="size-4 text-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12px]">{w.url}</p>
              <p className="truncate text-[11px] text-subtle">
                {w.events.join(", ")}
                {w.last &&
                  ` · último: ${w.last.status === "delivered" ? "entregue" : w.last.status === "failed" ? "falhou" : "na fila"}${w.last.response_code ? ` (${w.last.response_code})` : ""}`}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => ping.mutate(w.id)}
              disabled={ping.isPending}
            >
              <Send /> Testar
            </Button>
            <button
              type="button"
              aria-label="Excluir webhook"
              onClick={() => remove.mutate(w.id)}
              className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Novo webhook</DialogTitle>
              <DialogDescription>
                Mandamos um POST em JSON para a URL a cada evento escolhido.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="wh-url">URL (https)</Label>
                <Input
                  id="wh-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://seu-sistema.com/webhooks/vinculo"
                />
              </div>
              <div className="grid gap-2">
                <Label>Eventos</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev.id} className="flex items-center gap-2 text-[13px]">
                      <Checkbox
                        checked={events.includes(ev.id)}
                        onCheckedChange={(c) =>
                          setEvents((s) => (c ? [...s, ev.id] : s.filter((x) => x !== ev.id)))
                        }
                      />
                      {ev.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />} Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segredo de assinatura</DialogTitle>
            <DialogDescription>
              Guarde agora para validar as assinaturas. Ele não aparece de novo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={secret ?? ""} className="font-mono text-[12px]" />
            <Button variant="outline" onClick={() => secret && copy(secret)}>
              <Copy />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
