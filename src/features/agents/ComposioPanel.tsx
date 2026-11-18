import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { agentKeys, agentsApi, useComposioState } from "./api";
import { COMPOSIO_TOOLKITS } from "./catalog";
import { Pill } from "./ui";

const STATUS: Record<string, string> = {
  active: "Conectado",
  pending: "Esperando você autorizar",
  failed: "Falhou",
  expired: "Expirou, conecte de novo",
  disabled: "Desligado",
};

// Ferramentas conectadas (Composio): a chave é da sua empresa; cada app conecta por um link da
// própria Composio, sem a gente ver senha. O passo do assistente usa este mesmo painel.
export function ComposioPanel({
  accountId,
  compact,
  onConnected,
}: {
  accountId: string;
  compact?: boolean;
  onConnected?: () => void;
}) {
  const { isAdmin, isManager } = useAccount();
  const qc = useQueryClient();
  const state = useComposioState(accountId);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refreshed = useRef(false);
  const s = state.data;
  const conns = s?.connections ?? [];

  async function act(id: string, fn: () => Promise<string | void>) {
    setBusy(id);
    try {
      const msg = await fn();
      await qc.invalidateQueries({ queryKey: agentKeys.composio(accountId) });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const refresh = () =>
    act("refresh", async () => {
      const r = await agentsApi<{ connections: { status: string }[] }>(
        accountId,
        "composio.refresh",
      );
      const ok = r.connections.filter((c) => c.status === "active").length;
      if (ok) onConnected?.();
      return `${ok} app${ok === 1 ? "" : "s"} conectado${ok === 1 ? "" : "s"}`;
    });

  // voltou do link de conexão (?conectado=gmail): confere na hora
  useEffect(() => {
    if (refreshed.current || !s?.hasKey) return;
    if (
      new URLSearchParams(window.location.search).has("conectado") ||
      conns.some((c) => c.status === "pending")
    ) {
      refreshed.current = true;
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.hasKey]);

  if (state.isPending) return <Skeleton className="h-48 rounded-xl" />;
  if (state.isError) return <p className="text-[13px] text-danger">{errorMessage(state.error)}</p>;

  return (
    <div className="space-y-5">
      <section aria-labelledby="cp-key" className="rounded-xl border border-border bg-surface p-4">
        <h3 id="cp-key" className="flex items-center gap-2 text-[14px] font-medium">
          <KeyRound className="size-4 text-primary" aria-hidden /> 1. Chave da Composio da sua
          empresa
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Crie a conta gratuita em{" "}
          <a
            href="https://dashboard.composio.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline"
          >
            dashboard.composio.dev
          </a>
          , abra Configurações › API Keys e cole a chave aqui. Ela fica guardada no cofre da sua
          conta.
        </p>
        {s?.hasKey && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            {s.settings?.status === "connected" ? (
              <Pill className="text-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden /> Chave funcionando
              </Pill>
            ) : (
              <Pill tone="danger">{s.settings?.last_error ?? "Chave com erro"}</Pill>
            )}
            {s.settings?.tested_at && (
              <span className="text-subtle">testada {formatRelative(s.settings.tested_at)}</span>
            )}
          </p>
        )}
        {isAdmin ? (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim().length < 10) {
                toast.error("Cole a chave inteira");
                return;
              }
              void act("key", async () => {
                const r = await agentsApi<{ message: string }>(accountId, "composio.save_key", {
                  apiKey: key,
                });
                setKey("");
                return r.message;
              });
            }}
          >
            <Input
              type="password"
              translate="no"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={s?.hasKey ? "Trocar a chave (ak_...)" : "ak_..."}
              aria-label="Chave da Composio"
              className="flex-1"
            />
            <Button type="submit" disabled={busy === "key" || !key.trim()}>
              {busy === "key" && <Loader2 className="animate-spin" />} Salvar e testar
            </Button>
            {s?.hasKey && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy === "test"}
                onClick={() =>
                  void act(
                    "test",
                    async () =>
                      (await agentsApi<{ message: string }>(accountId, "composio.test")).message,
                  )
                }
              >
                {busy === "test" && <Loader2 className="animate-spin" />} Testar conexão
              </Button>
            )}
          </form>
        ) : (
          !s?.hasKey && (
            <p className="mt-2 text-[12px] text-subtle">
              Peça a um administrador da conta para colar a chave.
            </p>
          )
        )}
      </section>

      <section
        aria-labelledby="cp-apps"
        className={s?.hasKey ? "" : "pointer-events-none opacity-50"}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 id="cp-apps" className="text-[14px] font-medium">
            2. Conecte os apps que sua equipe usa
          </h3>
          {s?.hasKey && conns.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === "refresh"}
              onClick={() => void refresh()}
            >
              {busy === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Conferir
            </Button>
          )}
        </div>
        <ul
          className={
            compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          }
        >
          {COMPOSIO_TOOLKITS.map((t) => {
            const c = conns.find((x) => x.toolkit === t.slug);
            return (
              <li
                key={t.slug}
                className="flex flex-col rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={`https://logos.composio.dev/api/${t.slug}`}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    className="size-7 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{t.name}</p>
                    {!compact && <p className="text-[12px] text-muted-foreground">{t.summary}</p>}
                  </div>
                  {c &&
                    (c.status === "active" ? (
                      <CheckCircle2 className="size-4 text-foreground" aria-label="Conectado" />
                    ) : (
                      <Pill>{STATUS[c.status] ?? c.status}</Pill>
                    ))}
                </div>
                {c?.last_error && <p className="mt-2 text-[12px] text-danger">{c.last_error}</p>}
                {c?.status === "active" && t.inboxTrigger && c.channel_id && (
                  <p className="mt-2 text-[12px] text-subtle">
                    E-mails novos entram na caixa de entrada.
                  </p>
                )}
                {isManager && (
                  <div className="mt-3 flex gap-2">
                    {c?.status !== "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() =>
                          void act(t.slug, async () => {
                            const r = await agentsApi<{ url: string }>(
                              accountId,
                              "composio.connect",
                              { toolkit: t.slug },
                            );
                            window.open(r.url, "_blank", "noopener,noreferrer");
                            return "Autorize na janela que abriu e volte aqui para conferir.";
                          })
                        }
                      >
                        {busy === t.slug ? <Loader2 className="animate-spin" /> : <ExternalLink />}{" "}
                        Conectar
                      </Button>
                    )}
                    {c && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() =>
                          void act(`d-${t.slug}`, async () => {
                            await agentsApi(accountId, "composio.disconnect", { toolkit: t.slug });
                            return `${t.name} desconectado`;
                          })
                        }
                      >
                        <Unplug /> Desconectar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!compact && (
          <p className="mt-4 text-[12px] text-subtle">
            A tela de autorização do Google e da Microsoft mostra o nome Composio. Os dados das
            ações passam pelos servidores da Composio, nos Estados Unidos. E-mail novo pode levar
            alguns minutos para aparecer.
          </p>
        )}
      </section>
    </div>
  );
}
