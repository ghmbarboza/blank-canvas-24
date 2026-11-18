// WhatsApp por QR Code (Evolution), tudo na mesma tela: endereço e chave do servidor, botão
// Conectar, QR Code e, quando o celular lê, "Conectado". É o caminho principal da Central de CS: o
// passo "Conectar o WhatsApp" do primeiro acesso e a primeira opção em Canais usam este bloco.
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Loader2, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  channelAction,
  hasSecret,
  isConnected,
  useChannels,
  useIntegrations,
  useSaveIntegration,
  type CreateEvolutionResult,
  type QrPayload,
} from "./api";
import { checkEvolutionUrl, explainEvolutionError, type EvolutionHelp } from "./evolution-errors";
import { QrPanel } from "./QrPanel";
import { SecretInput } from "./SecretInput";

/** Onde conseguir um servidor, em uma frase e sem prometer preço. */
export const EVOLUTION_WHERE =
  "Ainda não tem servidor? Contrate um provedor de Evolution API (a Cloudfy é um exemplo): ele manda o endereço e a chave por e-mail.";

const HOW_TO_READ = [
  "Abra o WhatsApp no celular da empresa",
  "Toque em Dispositivos conectados",
  "Toque em Conectar dispositivo e aponte para o código",
];

// Quem demora mais que isso é servidor fora do ar: a tela não fica girando para sempre.
const SLOW_MS = 45_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      window.setTimeout(
        () => reject(new Error("O servidor demorou demais para responder (tempo esgotado)")),
        SLOW_MS,
      ),
    ),
  ]);
}

interface Props {
  accountId: string;
  /** o número conectou (o celular leu o código) */
  onConnected?: () => void;
  className?: string;
}

type Stage =
  { kind: "form" } | { kind: "qr"; channelId: string; initial?: QrPayload } | { kind: "connected" };

export function EvolutionConnect({ accountId, onConnected, className }: Props) {
  const uid = useId();
  const integrations = useIntegrations(accountId, true);
  const channels = useChannels(accountId);
  const save = useSaveIntegration(accountId);

  const server = integrations.data?.byProvider["evolution"];
  const serverReady = isConnected(integrations.data, "evolution");
  const keySaved = hasSecret(integrations.data, "evolution");

  const evo = useMemo(
    () => (channels.data ?? []).filter((c) => c.provider === "evolution"),
    [channels.data],
  );
  const connected = evo.find((c) => c.status === "connected") ?? null;
  // número criado e ainda não lido: o próximo clique reaproveita em vez de criar outro
  const pending = evo.find((c) => c.status !== "connected") ?? null;

  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [editServer, setEditServer] = useState(false);
  const [busy, setBusy] = useState<null | "server" | "qr">(null);
  const [help, setHelp] = useState<EvolutionHelp | null>(null);
  const [another, setAnother] = useState(false);

  // o endereço salvo volta para o campo (a chave nunca volta: fica só no cofre)
  useEffect(() => {
    if (server?.baseUrl) setBaseUrl((cur) => cur || server.baseUrl || "");
  }, [server?.baseUrl]);

  const showServerFields = !serverReady || editServer;
  const loading = integrations.isLoading || channels.isLoading;

  async function openQr(): Promise<void> {
    setBusy("qr");
    if (pending) {
      try {
        const qr = await withTimeout(
          channelAction<QrPayload>(accountId, "evolution.qr", { channelId: pending.id }),
        );
        setStage({ kind: "qr", channelId: pending.id, initial: qr });
        return;
      } catch {
        // o número antigo não existe mais no servidor (trocou de servidor): cria um novo abaixo
      }
    }
    const res = await withTimeout(
      channelAction<CreateEvolutionResult>(accountId, "evolution.create", {
        name: "WhatsApp",
        isShared: true,
      }),
    );
    void channels.refetch();
    setStage({
      kind: "qr",
      channelId: res.channelId,
      initial: { qr: res.qr, pairingCode: res.pairingCode },
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setHelp(null);
    try {
      if (showServerFields) {
        const url = checkEvolutionUrl(baseUrl);
        if (!url.ok) {
          setHelp({ problem: "url", title: "Confira o endereço do servidor", fix: url.message });
          return;
        }
        const key = apiKey.trim();
        if (!key && !keySaved) {
          setHelp({
            problem: "key",
            title: "Falta a chave do servidor",
            fix: "Cole a chave global (API Key) que o provedor mandou junto com o endereço.",
          });
          return;
        }
        setBaseUrl(url.url);
        setBusy("server");
        const res = await withTimeout(
          save.mutateAsync({
            provider: "evolution",
            baseUrl: url.url,
            ...(key ? { apiKey: key } : {}),
          }),
        );
        if (!res.ok) {
          setHelp(explainEvolutionError(res.error ?? "sem resposta do servidor (network)"));
          return;
        }
        // a chave foi para o cofre: some da tela e da memória da página
        setApiKey("");
        setEditServer(false);
      }
      await openQr();
    } catch (err) {
      setHelp(explainEvolutionError(errorMessage(err)));
    } finally {
      setBusy(null);
    }
  }

  function handleConnected() {
    setAnother(false);
    setStage({ kind: "connected" });
    onConnected?.();
  }

  if (loading)
    return (
      <div className={cn("grid place-items-center py-10", className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );

  if ((stage.kind === "connected" || (connected && stage.kind === "form")) && !another)
    return (
      <div
        role="status"
        className={cn("rounded-2xl border border-border bg-surface-2 p-5 text-center", className)}
      >
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft">
          <CheckCircle2 className="size-8 text-foreground" aria-hidden />
        </span>
        <p className="mt-3 text-[16px] font-semibold">WhatsApp conectado</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
          {connected?.handle ? `Número ${connected.handle}. ` : ""}
          As mensagens novas já chegam na Caixa de entrada.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => {
            setStage({ kind: "form" });
            setAnother(true);
          }}
        >
          Conectar outro número
        </Button>
      </div>
    );

  if (stage.kind === "qr")
    return (
      <div
        className={cn("grid gap-5 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center", className)}
      >
        <QrPanel
          accountId={accountId}
          channelId={stage.channelId}
          initial={stage.initial}
          onConnected={handleConnected}
        />
        <div>
          <p className="text-[14px] font-semibold">Leia o código com o celular da empresa</p>
          <ol className="mt-3 space-y-2.5 text-[13px]">
            {HOW_TO_READ.map((line, i) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-muted-foreground">
            O celular precisa estar com internet. Esta tela muda sozinha quando conectar.
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Use o WhatsApp da empresa, não o seu pessoal: toda conversa desse número entra na
            central e o atendente de IA, quando ligado, responde a todas.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 -ml-2"
            onClick={() => setStage({ kind: "form" })}
          >
            Voltar e trocar o servidor
          </Button>
        </div>
      </div>
    );

  const urlId = `${uid}-url`;
  const errId = `${uid}-err`;
  return (
    <form onSubmit={submit} className={cn("space-y-4", className)} autoComplete="off" noValidate>
      {showServerFields ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={urlId}>Endereço do servidor (URL)</Label>
            <Input
              id={urlId}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://evolution.suaempresa.com.br"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              aria-invalid={help?.problem === "url" || help?.problem === "not_found" || undefined}
              aria-describedby={help ? errId : undefined}
            />
          </div>
          <SecretInput
            id={`${uid}-key`}
            label="Chave do servidor (API Key global)"
            value={apiKey}
            onChange={setApiKey}
            configured={keySaved && !editServer}
            placeholder="Cole a chave que veio com o endereço"
          />
          <p className="text-[12px] text-muted-foreground">
            A chave vai direto para o cofre e não aparece de novo na tela. {EVOLUTION_WHERE}
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13px]">
          <CheckCircle2 className="size-4 shrink-0 text-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Servidor conectado
            {server?.baseUrl ? `: ${server.baseUrl.replace(/^https:\/\//, "")}` : ""}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditServer(true)}>
            Trocar
          </Button>
        </div>
      )}

      {help ? (
        <div
          id={errId}
          role="alert"
          className="flex gap-2.5 rounded-xl border border-hot-line bg-hot-soft px-3 py-2.5 text-[13px] text-hot-fg"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{help.title}.</span> {help.fix}
          </p>
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={busy !== null}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <QrCode aria-hidden />}
        {busy === "server"
          ? "Testando o servidor…"
          : busy === "qr"
            ? "Gerando o QR Code…"
            : showServerFields
              ? "Conectar"
              : "Gerar o QR Code"}
      </Button>
    </form>
  );
}
