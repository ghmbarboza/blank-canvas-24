import { useMemo, useState } from "react";
import { Plug } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { useTeamMembers } from "@/features/settings/api";
import {
  useChannelAction,
  useChannels,
  useRemoveChannel,
  useUpdateChannel,
  type Channel,
} from "./api";
import { ChannelCard, type ChannelIntent } from "./ChannelCard";
import { AssignDialog, RenameDialog, WebhookDialog } from "./ChannelDialogs";
import { CHANNEL_STATUS } from "./constants";
import { healthSummary } from "./health";
import { WhatsAppCallingDialog } from "./zernio/WhatsAppCallingDialog";

interface Props {
  accountId: string;
  isAdmin: boolean;
  onShowQr: (channelId: string) => void;
}

type Dialog = {
  kind: "rename" | "assign" | "webhook" | "logout" | "remove" | "calling";
  channel: Channel;
} | null;

export function ConnectedChannels({ accountId, isAdmin, onShowQr }: Props) {
  const channels = useChannels(accountId);
  const team = useTeamMembers(accountId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const status = useChannelAction<{ channelId: string }, { status: string }>(
    accountId,
    "evolution.status",
  );
  const sync = useChannelAction<{ channelId: string }, { groups: number }>(
    accountId,
    "evolution.sync_groups",
  );
  const logout = useChannelAction<{ channelId: string }, { ok: boolean }>(
    accountId,
    "evolution.logout",
  );
  const remove = useRemoveChannel(accountId);
  const update = useUpdateChannel(accountId);

  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );

  async function run<T>(channel: Channel, fn: () => Promise<T>, success: (r: T) => string) {
    setBusyId(channel.id);
    try {
      toast.success(success(await fn()));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function onIntent(intent: ChannelIntent, channel: Channel) {
    const id = { channelId: channel.id };
    if (intent === "qr") return onShowQr(channel.id);
    if (intent === "status") {
      return run(
        channel,
        () => status.mutateAsync(id),
        (r) => `Status: ${CHANNEL_STATUS[r.status]?.label ?? r.status}`,
      );
    }
    if (intent === "sync") {
      return run(
        channel,
        () => sync.mutateAsync(id),
        (r) => `${r.groups} ${r.groups === 1 ? "grupo sincronizado" : "grupos sincronizados"}`,
      );
    }
    setDialog({ kind: intent, channel });
  }

  function confirm() {
    if (!dialog) return;
    const { kind, channel } = dialog;
    setDialog(null);
    if (kind === "logout")
      void run(
        channel,
        () => logout.mutateAsync({ channelId: channel.id }),
        () => "Número desconectado",
      );
    if (kind === "remove")
      void run(
        channel,
        () => remove.mutateAsync(channel),
        () => "Canal removido",
      );
  }

  const summary = channels.data && channels.data.length > 0 ? healthSummary(channels.data) : null;

  const pick = (kind: NonNullable<Dialog>["kind"]) =>
    dialog?.kind === kind ? dialog.channel : null;
  const close = () => setDialog(null);

  return (
    <section aria-labelledby="connected-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="connected-heading" className="text-[17px] font-medium text-foreground">
          Canais operando
        </h2>
        {summary && <HealthPill ok={summary.ok} problems={summary.problems} />}
        {channels.data && channels.data.length > 0 && (
          <span className="ml-auto text-[12px] text-subtle tabular-nums">
            {channels.data.filter((c) => c.status === "connected").length} de {channels.data.length}{" "}
            no ar
          </span>
        )}
      </div>

      {channels.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}
      {channels.isError && (
        <p className="text-[13px] text-danger">{errorMessage(channels.error)}</p>
      )}
      {channels.data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface">
          <EmptyState
            icon={Plug}
            title="Nenhum canal conectado ainda"
            description={
              isAdmin
                ? "Comece pelo WhatsApp logo abaixo. Em poucos minutos as conversas chegam na caixa de entrada."
                : "Peça a um administrador para conectar o WhatsApp da empresa."
            }
          />
        </div>
      )}
      {channels.data && channels.data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {channels.data.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              ownerName={c.owner_user_id ? (names.get(c.owner_user_id) ?? "Vendedor") : null}
              canManage={isAdmin}
              busy={busyId === c.id}
              onIntent={onIntent}
              onToggleAi={(on) =>
                update.mutate(
                  { id: c.id, aiEnabled: on },
                  {
                    onSuccess: () =>
                      toast.success(
                        on
                          ? `IA ligada em ${c.name}`
                          : `IA desligada em ${c.name}: vai para a equipe`,
                      ),
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                )
              }
            />
          ))}
        </div>
      )}

      <RenameDialog accountId={accountId} channel={pick("rename")} onClose={close} />
      <AssignDialog
        accountId={accountId}
        channel={pick("assign")}
        onClose={close}
        members={team.data ?? []}
      />
      <WebhookDialog accountId={accountId} channel={pick("webhook")} onClose={close} />
      <WhatsAppCallingDialog accountId={accountId} channel={pick("calling")} onClose={close} />
      <AlertDialog
        open={dialog?.kind === "logout" || dialog?.kind === "remove"}
        onOpenChange={(o) => !o && close()}
      >
        <AlertDialogContent className="rounded-xl bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.kind === "logout"
                ? `Desconectar ${dialog.channel.name}?`
                : `Remover ${dialog?.channel.name ?? "canal"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "logout"
                ? "O número sai do WhatsApp Web. As conversas ficam guardadas e você pode ler o QR de novo quando quiser."
                : `O canal sai da conta e para de receber mensagens. O histórico das conversas fica guardado e visível para gestores.${
                    dialog?.channel.provider === "evolution"
                      ? " Para só pausar, use Desconectar."
                      : ""
                  }`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {dialog?.kind === "logout" ? "Desconectar" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function HealthPill({ ok, problems }: { ok: boolean; problems: number }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-foreground"
          : "inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger"
      }
    >
      {ok && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
      {ok ? "tudo normal" : `${problems} ${problems === 1 ? "precisa" : "precisam"} de atenção`}
    </span>
  );
}
