import { useEffect, useState } from "react";
import { useIntegration } from "@/features/integrations/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { patchAccountSettings } from "@/features/settings/api";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import {
  extensions,
  ivrMenus,
  phoneNumbers,
  queues,
  telKeys,
  telephonyApi,
  voiceAgents,
} from "./api";
import { toE164 } from "./lib";

interface TelSettings {
  balance_threshold_calls: number;
  avg_call_cost_usd: number;
  record_calls: boolean;
  coach_enabled: boolean;
  last_balance_usd?: number | null;
  last_calls_left?: number | null;
  last_balance_check_at?: string | null;
}
const DEFAULTS: TelSettings = {
  balance_threshold_calls: 20,
  avg_call_cost_usd: 0.25,
  record_calls: true,
  coach_enabled: true,
};

function copy(t: string) {
  void navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));
}

// Ajustes › Telefonia: conexão Zadarma, saldo vigiado, números, ramais, filas e URA.
export function TelephonyTab() {
  const { current, isManager, isAdmin } = useAccount();
  const accountId = current!.accountId;
  return (
    <div className="space-y-6">
      <ConnectionCard
        accountId={accountId}
        isManager={isManager}
        settings={{
          ...DEFAULTS,
          ...(((current!.settings as Record<string, unknown>)["telephony"] ??
            {}) as Partial<TelSettings>),
        }}
      />
      <NumbersCard accountId={accountId} canEdit={isManager} canRegister={isAdmin} />
      <ExtensionsCard accountId={accountId} canEdit={isManager} />
      <QueuesCard accountId={accountId} canEdit={isManager} />
      <IvrCard accountId={accountId} canEdit={isManager} />
    </div>
  );
}

function ConnectionCard({
  accountId,
  isManager,
  settings,
}: {
  accountId: string;
  isManager: boolean;
  settings: TelSettings;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [JSON.stringify(settings)]); // eslint-disable-line react-hooks/exhaustive-deps
  const zadarma = useIntegration(accountId, "zadarma");
  const balance = useQuery({
    queryKey: ["zadarma-balance", accountId],
    // Só consulta o saldo com a Zadarma conectada (sem ela a rota responde 412).
    enabled: isManager && zadarma.data?.status === "connected",
    retry: false,
    queryFn: () => telephonyApi.balance(accountId),
  });
  const save = useMutation({
    mutationFn: () =>
      patchAccountSettings(accountId, (cur) => ({
        ...cur,
        telephony: { ...((cur["telephony"] as object) ?? {}), ...form } as never,
      })),
    onSuccess: () => {
      toast.success("Preferências salvas");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      void balance.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const hook = `${origin}/api/public/zadarma?a=${accountId}`;

  return (
    <SettingsCard
      title="Telefonia (Zadarma)"
      description="Ligações humanas e da IA saem pela conta Zadarma da sua empresa. Cada empresa usa a própria conta: nunca a de outra."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-[#001F35] p-5 text-white">
          <p className="text-[11px] tracking-[0.16em] text-white/60 uppercase">Saldo</p>
          {balance.isPending ? (
            <Loader2 className="mt-3 size-5 animate-spin" />
          ) : balance.isError ? (
            <p className="mt-2 text-[13px] text-white/80">{errorMessage(balance.error)}</p>
          ) : (
            <>
              <p className="mt-1 font-display text-[32px] font-semibold tabular-nums">
                {balance.data!.currency} {balance.data!.balance.toFixed(2)}
              </p>
              <p className="text-[13px] text-white/70">
                ≈ {balance.data!.calls_left ?? "∞"} ligações · alerta abaixo de{" "}
                {balance.data!.threshold_calls}
              </p>
              {balance.data!.low && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#F3C9C9]">
                  <AlertTriangle className="size-3.5" /> Saldo baixo: recarregue antes que as
                  ligações parem.
                </p>
              )}
            </>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => void balance.refetch()}
          >
            <RefreshCw /> Atualizar
          </Button>
        </div>
        <div className="space-y-3 text-[12px] text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Teto de custo por minuto.</span> A
            Zadarma recusa ligações mais caras que o teto definido no painel dela (Perfil ›
            configurações de chamadas), e esse teto só muda por lá. Quando uma ligação cai por isso,
            avisamos “teto por minuto”, e não “saldo”: carregar saldo não resolve.
          </p>
          <div>
            <p className="mb-1 font-semibold text-foreground">
              Webhook de ligações (cole no painel da Zadarma › API › Notificações)
            </p>
            <div className="flex gap-2">
              <Input readOnly value={hook} className="font-mono text-[11px]" />
              <Button size="icon" variant="outline" onClick={() => copy(hook)} aria-label="Copiar">
                <Copy />
              </Button>
            </div>
          </div>
        </div>
      </div>
      {isManager && (
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="tel-th">Avisar quando o saldo der para menos de (ligações)</Label>
            <Input
              id="tel-th"
              inputMode="numeric"
              value={form.balance_threshold_calls}
              onChange={(e) =>
                setForm({
                  ...form,
                  balance_threshold_calls: Number(e.target.value.replace(/\D/g, "")) || 0,
                })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tel-avg">
              Custo médio de uma ligação, em dólar (para estimar quantas o saldo paga)
            </Label>
            <Input
              id="tel-avg"
              inputMode="decimal"
              value={form.avg_call_cost_usd}
              onChange={(e) =>
                setForm({
                  ...form,
                  avg_call_cost_usd: Number(e.target.value.replace(",", ".")) || 0,
                })
              }
            />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
            Gravar e transcrever ligações
            <Switch
              checked={form.record_calls}
              onCheckedChange={(c) => setForm({ ...form, record_calls: c })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
            Coach ao vivo nas ligações
            <Switch
              checked={form.coach_enabled}
              onCheckedChange={(c) => setForm({ ...form, coach_enabled: c })}
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar preferências
            </Button>
          </div>
        </form>
      )}
    </SettingsCard>
  );
}

function NumbersCard({
  accountId,
  canEdit,
  canRegister,
}: {
  accountId: string;
  canEdit: boolean;
  canRegister: boolean;
}) {
  const list = phoneNumbers.useList(accountId);
  const save = phoneNumbers.useSave(accountId);
  const remove = phoneNumbers.useRemove(accountId);
  const agents = voiceAgents.useList(accountId);
  const qs = queues.useList(accountId);
  const [n, setN] = useState({ number: "", label: "", sip_id: "" });
  const [registering, setRegistering] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");

  async function add() {
    const e164 = toE164(n.number);
    if (!e164) {
      toast.error("Número inválido. Use DDD + número.");
      return;
    }
    try {
      await save.mutateAsync({
        values: { number: e164, label: n.label || null, sip_id: n.sip_id || null },
      });
      setN({ number: "", label: "", sip_id: "" });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function register(id: string) {
    setAsking(null);
    setRegistering(id);
    try {
      const r = await telephonyApi.registerNumber(accountId, id, pwd || null);
      toast.success(
        `Número registrado na ElevenLabs${r.assigned_agent ? " e ligado ao agente" : ""}`,
      );
      void list.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRegistering(null);
      setPwd("");
    }
  }

  return (
    <SettingsCard
      title="Números"
      description="Números da Zadarma: para receber (com fila ou agente de IA) e para ligar. Registre na ElevenLabs os que a IA usa."
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhum número cadastrado.
          </li>
        )}
        {(list.data ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[13px]">{p.number}</p>
              <p className="text-[11px] text-subtle">
                {p.label ?? "sem nome"} · SIP {p.sip_id ?? "—"} ·{" "}
                {p.elevenlabs_phone_id ? "registrado na ElevenLabs" : "não registrado na IA"}
              </p>
            </div>
            {canEdit && (
              <>
                <Select
                  value={
                    p.voice_agent_id
                      ? `a:${p.voice_agent_id}`
                      : p.queue_id
                        ? `q:${p.queue_id}`
                        : "none"
                  }
                  onValueChange={(v) =>
                    save.mutate({
                      id: p.id,
                      values: {
                        voice_agent_id: v.startsWith("a:") ? v.slice(2) : null,
                        queue_id: v.startsWith("q:") ? v.slice(2) : null,
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-48 text-[12px]" aria-label="Quem atende">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Atendimento pelo PABX</SelectItem>
                    {(qs.data ?? []).map((q) => (
                      <SelectItem key={q.id} value={`q:${q.id}`}>
                        Fila {q.name}
                      </SelectItem>
                    ))}
                    {(agents.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={`a:${a.id}`}>
                        IA {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canRegister && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={registering === p.id}
                    onClick={() => (p.elevenlabs_phone_id ? void register(p.id) : setAsking(p.id))}
                  >
                    {registering === p.id && <Loader2 className="animate-spin" />}{" "}
                    {p.elevenlabs_phone_id ? "Atualizar na IA" : "Registrar na IA"}
                  </Button>
                )}
                <button
                  type="button"
                  aria-label="Remover número"
                  onClick={() => remove.mutate(p.id)}
                  className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (asking) void register(asking);
            }}
          >
            <DialogHeader>
              <DialogTitle>Registrar número na ElevenLabs</DialogTitle>
              <DialogDescription>
                A senha SIP da Zadarma vai direto para a ElevenLabs (tronco de saída). Ela não fica
                guardada na Central de CS.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="mt-4"
              type="password"
              translate="no"
              autoComplete="off"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Senha SIP do número"
              aria-label="Senha SIP"
            />
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={!pwd}>
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {canEdit && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={n.number}
            onChange={(e) => setN({ ...n, number: e.target.value })}
            placeholder="(48) 4042-9388"
            aria-label="Número"
          />
          <Input
            value={n.label}
            onChange={(e) => setN({ ...n, label: e.target.value })}
            placeholder="Nome (ex.: Vendas)"
            aria-label="Nome"
          />
          <Input
            value={n.sip_id}
            onChange={(e) => setN({ ...n, sip_id: e.target.value })}
            placeholder="Login SIP (ex.: 123456-100)"
            aria-label="Login SIP"
          />
          <Button type="submit" variant="outline">
            <Plus /> Adicionar
          </Button>
        </form>
      )}
    </SettingsCard>
  );
}

function ExtensionsCard({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  const team = useTeamMembers(accountId);
  const list = extensions.useList(accountId);
  const save = extensions.useSave(accountId);
  const remove = extensions.useRemove(accountId);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (userId: string) => telephonyApi.createExtension(accountId, userId),
    onSuccess: (r) => {
      toast.success(`Ramal ${r.extension} criado na Zadarma`);
      void qc.invalidateQueries({ queryKey: telKeys.extensions(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [drafts, setDrafts] = useState<
    Record<string, { extension: string; sip_login: string; mobile: string }>
  >({});

  return (
    <SettingsCard
      title="Ramais dos vendedores"
      description="Cada vendedor precisa de um ramal da Zadarma para atender e ligar pelo navegador. Use Criar ramal para abrir um novo na Zadarma sem sair daqui, ou digite um que já existe. O celular é opcional."
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(team.data ?? []).map((m) => {
          const ext = list.data?.find((e) => e.user_id === m.userId);
          const d = drafts[m.userId] ?? {
            extension: ext?.extension ?? "",
            sip_login: ext?.sip_login ?? "",
            mobile: ext?.mobile ?? "",
          };
          const set = (patch: Partial<typeof d>) =>
            setDrafts((s) => ({ ...s, [m.userId]: { ...d, ...patch } }));
          return (
            <li
              key={m.userId}
              className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_90px_160px_150px_auto]"
            >
              <p className="truncate text-[13px] font-medium">{m.name}</p>
              <Input
                disabled={!canEdit}
                value={d.extension}
                onChange={(e) => set({ extension: e.target.value.replace(/\D/g, "") })}
                placeholder="Ramal"
                aria-label={`Ramal de ${m.name}`}
                className="h-8"
              />
              <Input
                disabled={!canEdit}
                value={d.sip_login}
                onChange={(e) => set({ sip_login: e.target.value })}
                placeholder="Login SIP"
                aria-label={`Login SIP de ${m.name}`}
                className="h-8"
              />
              <Input
                disabled={!canEdit}
                value={d.mobile}
                onChange={(e) => set({ mobile: e.target.value })}
                placeholder="Celular (opcional)"
                aria-label={`Celular de ${m.name}`}
                className="h-8"
              />
              {canEdit && (
                <div className="flex gap-1">
                  {!ext && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={create.isPending}
                      onClick={() => create.mutate(m.userId)}
                      title="Abre um ramal novo na PABX da Zadarma para esta pessoa"
                    >
                      {create.isPending && create.variables === m.userId ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      Criar ramal
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!d.extension}
                    onClick={() =>
                      save.mutate(
                        {
                          ...(ext ? { id: ext.id } : {}),
                          values: {
                            user_id: m.userId,
                            extension: d.extension,
                            sip_login: d.sip_login || null,
                            mobile: d.mobile || null,
                          },
                        },
                        {
                          onSuccess: () => toast.success(`Ramal de ${m.name} salvo`),
                          onError: (e) =>
                            toast.error(
                              errorMessage(e).includes("extension")
                                ? "Este ramal já é de outra pessoa"
                                : errorMessage(e),
                            ),
                        },
                      )
                    }
                  >
                    Salvar
                  </Button>
                  {ext && (
                    <button
                      type="button"
                      aria-label="Remover ramal"
                      onClick={() => remove.mutate(ext.id)}
                      className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

const STRATEGY: Record<string, string> = {
  owner_first: "Dono do contato primeiro",
  round_robin: "Rodízio",
  least_recent: "Quem está há mais tempo sem atender",
  ring_all: "Tocar para todos",
};

function QueuesCard({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  const list = queues.useList(accountId);
  const save = queues.useSave(accountId);
  const remove = queues.useRemove(accountId);
  const [name, setName] = useState("");
  return (
    <SettingsCard
      title="Filas"
      description="Para onde vai a ligação recebida, em que ordem e qual a meta de atendimento. O painel ao vivo mede a fila por aqui."
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(list.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma fila. Crie “Vendas” e “Suporte”, por exemplo.
          </li>
        )}
        {(list.data ?? []).map((q) => (
          <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 text-[13px] font-medium">{q.name}</p>
            <Select
              disabled={!canEdit}
              value={q.strategy}
              onValueChange={(v) => save.mutate({ id: q.id, values: { strategy: v } })}
            >
              <SelectTrigger className="h-8 w-56 text-[12px]" aria-label="Estratégia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STRATEGY).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              Meta
              <Input
                disabled={!canEdit}
                className="h-8 w-16"
                inputMode="numeric"
                defaultValue={q.sla_seconds}
                onBlur={(e) =>
                  save.mutate({
                    id: q.id,
                    values: {
                      sla_seconds: Math.max(5, Math.min(600, Number(e.target.value) || 20)),
                    },
                  })
                }
                aria-label="Meta em segundos"
              />
              s
            </label>
            {canEdit && (
              <button
                type="button"
                aria-label="Remover fila"
                onClick={() => remove.mutate(q.id)}
                className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim())
              save.mutate({ values: { name: name.trim() } }, { onSuccess: () => setName("") });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da fila"
            aria-label="Nome da fila"
          />
          <Button type="submit" variant="outline">
            <Plus /> Criar fila
          </Button>
        </form>
      )}
    </SettingsCard>
  );
}

interface IvrOption {
  digit: string;
  label: string;
  target: string;
}

function IvrCard({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  const list = ivrMenus.useList(accountId);
  const save = ivrMenus.useSave(accountId);
  const qs = queues.useList(accountId);
  const agents = voiceAgents.useList(accountId);
  const menu = list.data?.[0];
  const [greeting, setGreeting] = useState("");
  const [opts, setOpts] = useState<IvrOption[]>([]);
  useEffect(() => {
    setGreeting(
      menu?.greeting ??
        "Olá! Você ligou para a nossa empresa. Para falar com vendas, digite 1. Para suporte, digite 2.",
    );
    setOpts(
      ((menu?.tree as { options?: IvrOption[] } | undefined)?.options ?? [
        { digit: "1", label: "Vendas", target: "" },
        { digit: "2", label: "Suporte", target: "" },
      ]) as IvrOption[],
    );
  }, [menu?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SettingsCard
      title="URA (menu de atendimento)"
      description="O que a pessoa ouve ao ligar e para onde vai cada tecla. A URA roda no PABX da Zadarma; aqui fica o desenho e o destino de cada opção."
    >
      <div className="grid gap-3">
        <Textarea
          disabled={!canEdit}
          rows={2}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          aria-label="Mensagem de boas-vindas"
        />
        {opts.map((o, i) => (
          <div key={i} className="grid items-center gap-2 sm:grid-cols-[60px_1fr_1fr_auto]">
            <Input
              disabled={!canEdit}
              value={o.digit}
              onChange={(e) =>
                setOpts(
                  opts.map((x, j) => (j === i ? { ...x, digit: e.target.value.slice(0, 1) } : x)),
                )
              }
              aria-label="Tecla"
            />
            <Input
              disabled={!canEdit}
              value={o.label}
              onChange={(e) =>
                setOpts(opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              aria-label="Opção"
            />
            <Select
              disabled={!canEdit}
              {...(o.target ? { value: o.target } : {})}
              onValueChange={(v) =>
                setOpts(opts.map((x, j) => (j === i ? { ...x, target: v } : x)))
              }
            >
              <SelectTrigger aria-label="Destino">
                <SelectValue placeholder="Destino" />
              </SelectTrigger>
              <SelectContent>
                {(qs.data ?? []).map((q) => (
                  <SelectItem key={q.id} value={`queue:${q.id}`}>
                    Fila {q.name}
                  </SelectItem>
                ))}
                {(agents.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={`agent:${a.id}`}>
                    IA {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && (
              <button
                type="button"
                aria-label="Remover opção"
                onClick={() => setOpts(opts.filter((_, j) => j !== i))}
                className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setOpts([...opts, { digit: String(opts.length + 1), label: "", target: "" }])
              }
            >
              <Plus /> Opção
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    ...(menu ? { id: menu.id } : {}),
                    values: {
                      name: menu?.name ?? "Principal",
                      greeting,
                      tree: { options: opts } as never,
                    },
                  },
                  {
                    onSuccess: () =>
                      toast.success("URA salva. Replique as opções no PABX da Zadarma."),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              <Save /> Salvar URA
            </Button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
