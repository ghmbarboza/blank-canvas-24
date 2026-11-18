import { hasChannel } from "@/lib/edition";
import { BellRing, Loader2, MonitorSmartphone, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import {
  notificationGroupLabel,
  notificationKindsFor,
  resolveChannels,
  type Channels,
  type NotificationKind,
  type PrefRow,
} from "./delivery";
import {
  useDisablePush,
  useEnablePush,
  useNotificationPrefs,
  usePushState,
  useResetNotificationPref,
  useSaveNotificationPref,
  useSendTestNotification,
} from "./prefs-api";

// aviso por e-mail só com o canal e-mail na edição (ele depende de um serviço de envio)
const CHANNELS: { id: keyof Channels; label: string }[] = [
  { id: "app" as const, label: "No app" },
  { id: "email" as const, label: "E-mail" },
  { id: "push" as const, label: "Navegador" },
].filter((c) => c.id !== "email" || hasChannel("email"));

const PUSH_TEXT = {
  unsupported:
    "Este navegador não aceita avisos. No iPhone, adicione a Central de CS à tela inicial primeiro.",
  denied:
    "Os avisos estão bloqueados neste navegador. Libere nas configurações do site e volte aqui.",
  off: "Receba avisos mesmo com a Central de CS fechado ou em outra aba.",
  on: "Este navegador está recebendo avisos.",
} as const;

// Ajustes, Notificações: cada pessoa escolhe por tipo onde quer ser avisada (app, e-mail, navegador).
export function NotificationSettingsTab() {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const prefs = useNotificationPrefs(accountId);
  const push = usePushState();
  const enable = useEnablePush();
  const disable = useDisablePush();
  const test = useSendTestNotification(accountId);
  const state = push.data ?? "off";

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Avisos no navegador"
        description="Vale só para este navegador. Ligue em cada computador ou celular que você usa."
      >
        <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-border bg-surface-2 p-4">
          <span className="grid size-10 place-items-center rounded-full bg-[#001F35] text-white">
            <MonitorSmartphone className="size-4" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{PUSH_TEXT[state]}</p>
          {state === "off" && (
            <Button
              size="sm"
              disabled={enable.isPending}
              onClick={() =>
                enable.mutate(undefined, {
                  onSuccess: () => toast.success("Avisos ligados neste navegador"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {enable.isPending ? <Loader2 className="animate-spin" /> : <BellRing />} Ligar avisos
            </Button>
          )}
          {state === "on" && (
            <Button
              size="sm"
              variant="outline"
              disabled={disable.isPending}
              onClick={() =>
                disable.mutate(undefined, {
                  onSuccess: () => toast.success("Avisos desligados neste navegador"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Desligar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={test.isPending}
            onClick={() =>
              test.mutate(undefined, {
                onSuccess: () =>
                  toast.success(
                    hasChannel("email")
                      ? "Teste enviado. Confira o sino, o e-mail e o navegador."
                      : "Teste enviado. Confira o sino e o navegador.",
                  ),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <Send /> Enviar teste
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="O que avisar e onde"
        description="Desligar “No app” faz o aviso chegar já lido, sem acender o sino. E-mail sai pelo remetente da empresa, se ele estiver conectado."
      >
        {prefs.isPending ? (
          <Skeleton className="h-64 rounded-[20px]" />
        ) : (
          <PrefsTable accountId={accountId} rows={prefs.data ?? []} />
        )}
      </SettingsCard>
    </div>
  );
}

function PrefsTable({ accountId, rows }: { accountId: string; rows: PrefRow[] }) {
  const save = useSaveNotificationPref(accountId);
  const reset = useResetNotificationPref(accountId);
  const kinds = notificationKindsFor();
  const groups = [...new Set(kinds.map((k) => k.group))];

  function toggle(kind: string, channels: Channels, id: keyof Channels, value: boolean) {
    save.mutate(
      { kind, channels: { ...channels, [id]: value } },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  }

  const defaults = resolveChannels(rows, "*");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] tracking-wide text-subtle uppercase">
            <th className="py-2 font-medium">Tipo de aviso</th>
            {CHANNELS.map((c) => (
              <th key={c.id} className="w-24 py-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border bg-primary-soft/40">
            <td className="py-2.5 pr-3">
              <p className="font-medium">Padrão para tudo</p>
              <p className="text-[11px] text-subtle">Vale para os tipos que você não mudou</p>
            </td>
            {CHANNELS.map((c) => (
              <td key={c.id} className="text-center">
                <Switch
                  checked={defaults[c.id]}
                  aria-label={`Padrão: ${c.label}`}
                  onCheckedChange={(v) => toggle("*", defaults, c.id, v)}
                />
              </td>
            ))}
          </tr>
          {groups.map((g) => (
            <GroupRows
              key={g}
              group={notificationGroupLabel(g)}
              kinds={kinds.filter((k) => k.group === g)}
              rows={rows}
              onToggle={toggle}
              onReset={(kind) =>
                reset.mutate(kind, { onError: (e) => toast.error(errorMessage(e)) })
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  kinds,
  rows,
  onToggle,
  onReset,
}: {
  group: string;
  kinds: NotificationKind[];
  rows: PrefRow[];
  onToggle: (kind: string, channels: Channels, id: keyof Channels, value: boolean) => void;
  onReset: (kind: string) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="pt-5 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase"
        >
          {group}
        </td>
      </tr>
      {kinds.map((k) => {
        const ch = resolveChannels(rows, k.id);
        const custom = rows.some((r) => r.kind === k.id);
        return (
          <tr key={k.id} className="border-t border-border">
            <td className="py-2.5 pr-3">
              {k.label}
              {custom && (
                <button
                  type="button"
                  onClick={() => onReset(k.id)}
                  className="ml-2 text-[11px] text-primary hover:underline"
                >
                  voltar ao padrão
                </button>
              )}
            </td>
            {CHANNELS.map((c) => (
              <td key={c.id} className="text-center">
                <Switch
                  checked={ch[c.id]}
                  aria-label={`${k.label}: ${c.label}`}
                  onCheckedChange={(v) => onToggle(k.id, ch, c.id, v)}
                />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
