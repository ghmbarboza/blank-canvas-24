import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePipelines } from "@/features/crm/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { Panel } from "@/features/reports/ui";

import { useCrmAction, useCrmStatus, type CrmConnection, type CrmLogRow } from "../api";
import { ENTITY_LABEL, PROVIDER_LABEL, type SyncProvider } from "../sync/types";
import { Field } from "./StaffingTab";

const HELP: Record<SyncProvider, { steps: string; placeholder: string }> = {
  rdstation_crm: {
    steps:
      "No RD Station CRM: Configurações da conta → Integrações → Token da instância. Copie e cole aqui.",
    placeholder: "Token da instância do RD Station CRM",
  },
  hubspot: {
    steps:
      "No HubSpot: Configurações → Integrações → Apps privados → Criar app. Marque leitura e escrita de contatos, empresas e negócios (deals) e copie o token.",
    placeholder: "pat-na1-…",
  },
};

const DIRECTION: Record<CrmConnection["direction"], string> = {
  both: "Nos dois sentidos",
  pull: "Só trazer de lá para cá",
  push: "Só levar daqui para lá",
};

const STATUS_LABEL: Record<CrmConnection["status"], string> = {
  pending: "Falta testar",
  connected: "Conectado",
  error: "Com erro",
  paused: "Pausado",
};

const ACTION_LABEL: Record<CrmLogRow["action"], string> = {
  created: "criou",
  updated: "atualizou",
  skipped: "pulou",
  conflict: "conflito",
  error: "erro",
};

export function CrmSyncPanel({
  accountId,
  provider,
  canEdit,
}: {
  accountId: string;
  provider: SyncProvider;
  canEdit: boolean;
}) {
  const status = useCrmStatus(accountId);
  const act = useCrmAction(accountId);
  const pipelines = usePipelines(accountId);
  const conn = status.data?.connections.find((c) => c.provider === provider) ?? null;
  const hasToken = status.data?.tokens[provider] ?? false;
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<CrmConnection["direction"] | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const dir = direction ?? conn?.direction ?? "both";
  const pipe = pipelineId ?? conn?.settings.pipeline_id ?? "";

  const run = (input: Parameters<typeof act.mutate>[0], ok: string) =>
    act.mutate(input, {
      onSuccess: (r) => {
        toast.success(r.message ?? ok);
        if (input.action === "crm.save") setToken("");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const live = conn?.status === "connected";
  const res = conn?.last_result;
  const myLog = (status.data?.log ?? []).filter((l) => l.provider === provider).slice(0, 15);

  return (
    <Panel
      title={PROVIDER_LABEL[provider]}
      brand={provider === "hubspot" ? "hubspot" : "rdstation"}
      {...(conn?.connected_label ? { hint: conn.connected_label } : {})}
      aside={
        conn && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium">
            {live && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
            {STATUS_LABEL[conn.status]}
          </span>
        )
      }
    >
      {status.isPending ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {status.isError && (
            <p className="rounded-xl bg-danger/10 p-3 text-[12px] text-danger">
              Não deu para ler o estado da conexão ({errorMessage(status.error)}). Você ainda pode
              salvar o token e testar.
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">{HELP[provider].steps}</p>
          {canEdit && (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  {
                    action: "crm.save",
                    provider,
                    ...(token ? { token } : {}),
                    direction: dir,
                    pipelineId: pipe || null,
                  },
                  "Salvo",
                );
              }}
            >
              <Field
                label={hasToken ? "Token (já salvo; cole outro para trocar)" : "Token"}
                className="sm:col-span-2"
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={token}
                  placeholder={hasToken ? "••••••••" : HELP[provider].placeholder}
                  onChange={(e) => setToken(e.target.value)}
                />
              </Field>
              <Field label="Sentido">
                <Select
                  value={dir}
                  onValueChange={(v) => setDirection(v as CrmConnection["direction"])}
                >
                  <SelectTrigger aria-label="Sentido da sincronização">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DIRECTION) as CrmConnection["direction"][]).map((d) => (
                      <SelectItem key={d} value={d}>
                        {DIRECTION[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quadro dos cartões trazidos">
                <Select
                  value={pipe || "default"}
                  onValueChange={(v) => setPipelineId(v === "default" ? "" : v)}
                >
                  <SelectTrigger aria-label="Quadro">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Quadro padrão</SelectItem>
                    {(pipelines.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" disabled={act.isPending || (!token && !hasToken)}>
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={act.isPending || !hasToken}
                  onClick={() => run({ action: "crm.test", provider }, "Conectado")}
                >
                  {act.isPending && act.variables?.action === "crm.test" ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <PlugZap className="size-3.5" aria-hidden />
                  )}{" "}
                  Testar
                </Button>
                {conn && conn.status !== "paused" && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() => run({ action: "crm.pause", provider }, "Pausado")}
                  >
                    Pausar
                  </Button>
                )}
                {conn?.status === "paused" && hasToken && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() => run({ action: "crm.resume", provider }, "Retomado")}
                  >
                    Retomar
                  </Button>
                )}
                {hasToken && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger"
                    disabled={act.isPending}
                    onClick={() => run({ action: "crm.disconnect", provider }, "Desconectado")}
                  >
                    Desconectar
                  </Button>
                )}
              </div>
              {dir !== "pull" && (
                <p className="text-[12px] text-muted-foreground sm:col-span-2">
                  Nos dois sentidos, o que for criado ou alterado aqui também vai para o{" "}
                  {PROVIDER_LABEL[provider]}. Se os dois lados mudarem o mesmo registro, vale a
                  última alteração e fica no histórico abaixo.
                </p>
              )}
            </form>
          )}
          {conn?.last_error && (
            <p className="rounded-xl bg-danger/10 p-3 text-[12px] text-danger">{conn.last_error}</p>
          )}
          {live && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-[13px]">
              <span>
                {conn?.last_sync_at
                  ? `Última rodada ${formatRelative(conn.last_sync_at)}`
                  : "Ainda não rodou"}
                {res && (
                  <span className="ml-2 text-muted-foreground">
                    <ArrowDownToLine className="inline size-3" aria-hidden />{" "}
                    {(res.pulled_created ?? 0) + (res.pulled_updated ?? 0)} ·{" "}
                    <ArrowUpFromLine className="inline size-3" aria-hidden />{" "}
                    {(res.pushed_created ?? 0) + (res.pushed_updated ?? 0)}
                    {res.conflicts ? ` · ${res.conflicts} conflito(s)` : ""}
                    {res.errors ? ` · ${res.errors} erro(s)` : ""}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => run({ action: "crm.sync_now", provider }, "Na fila")}
              >
                <RefreshCw className="size-3.5" aria-hidden /> Sincronizar agora
              </Button>
            </div>
          )}
          {res?.limitations?.map((l) => (
            <p key={l} className="text-[12px] text-subtle">
              {l}
            </p>
          ))}
          {myLog.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Histórico recente</p>
              <ul className="space-y-1 text-[12px]">
                {myLog.map((l) => (
                  <li key={l.id} className="flex gap-2">
                    <span className="shrink-0 text-subtle tabular-nums">
                      {formatRelative(l.created_at)}
                    </span>
                    <span className={cn(l.action === "error" && "text-danger")}>
                      {l.direction === "pull" ? "Trouxe" : "Levou"} ({ENTITY_LABEL[l.entity]}):{" "}
                      {ACTION_LABEL[l.action]}
                      {typeof l.detail["winner"] === "string" &&
                        `: venceu o lado ${l.detail["winner"] === "local" ? "daqui" : "de lá"}`}
                      {typeof l.detail["message"] === "string" && `: ${l.detail["message"]}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function CrmSyncTab({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Já usa outro CRM? Conecte com o token da sua conta e a central mantém contatos, empresas e
        carteira iguais nos dois lados, a cada 30 minutos.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <CrmSyncPanel accountId={accountId} provider="rdstation_crm" canEdit={canEdit} />
        <CrmSyncPanel accountId={accountId} provider="hubspot" canEdit={canEdit} />
      </div>
    </div>
  );
}
