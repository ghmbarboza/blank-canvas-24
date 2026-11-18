import { hasChannel } from "@/lib/edition";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCheck,
  Headphones,
  ListOrdered,
  Loader2,
  MonitorPlay,
  Phone,
  PhoneForwarded,
  RefreshCw,
  Settings2,
  Bot,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSoftphone } from "@/features/telephony/softphone/softphone-context";
import { useAccount, useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { formatPhone, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useAcceptItem,
  useClaimNext,
  useConfirmWrap,
  useDeclineItem,
  useFinishItem,
  useMyAgent,
  useMyItems,
  useQueueRealtime,
  useRegenerateWrap,
  type MyItem,
} from "./api";
import { CallbackDialog } from "./CallbackDialog";
import { KIND_LABEL, WRAP_RESULTS, channelLabel, formatSeconds, type WorkKind } from "./lib";
import { TransferDialog } from "./TransferDialog";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function SourceLink({ item }: { item: MyItem }) {
  if (item.source_table === "conversations" && item.source_id)
    return (
      <Button asChild size="sm" variant="outline" className="rounded-full">
        <Link to="/inbox/$conversationId" params={{ conversationId: item.source_id }}>
          Abrir conversa
        </Link>
      </Button>
    );
  if (item.source_table === "tickets" && item.source_id)
    return (
      <Button asChild size="sm" variant="outline" className="rounded-full">
        <Link to="/atendimento" search={{ chamado: item.source_id }}>
          Abrir chamado
        </Link>
      </Button>
    );
  if (item.source_table === "calls" && item.source_id && hasChannel("phone"))
    return (
      <Button asChild size="sm" variant="outline" className="rounded-full">
        <Link to="/ligacoes" search={{ chamada: item.source_id }}>
          Ver ligação
        </Link>
      </Button>
    );
  if (item.contact_id)
    return (
      <Button asChild size="sm" variant="outline" className="rounded-full">
        <Link to="/contatos/$contactId" params={{ contactId: item.contact_id }}>
          Ficha do contato
        </Link>
      </Button>
    );
  return null;
}

function ItemHead({ item }: { item: MyItem }) {
  const who = item.contacts?.name ?? (item.phone ? formatPhone(item.phone) : null);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {KIND_LABEL[item.kind as WorkKind] ?? item.kind}
        </span>
        <span className="text-[11px] text-subtle">{channelLabel(item.channel)}</span>
      </div>
      <p className="mt-1 truncate text-[14px] font-semibold text-foreground">
        {who ?? item.subject ?? "Atendimento"}
      </p>
      {who && item.subject && (
        <p className="truncate text-[13px] text-muted-foreground">{item.subject}</p>
      )}
    </div>
  );
}

function ReservedCard({ item, accountId }: { item: MyItem; accountId: string }) {
  const now = useNow();
  const accept = useAcceptItem(accountId);
  const decline = useDeclineItem(accountId);
  const left = item.reserved_until
    ? Math.max(0, Math.round((new Date(item.reserved_until).getTime() - now) / 1000))
    : 0;
  const who = item.contacts?.name ?? (item.phone ? formatPhone(item.phone) : null);
  const slaMin = item.sla_due_at
    ? Math.round((new Date(item.sla_due_at).getTime() - now) / 60_000)
    : null;
  // Direção do AIDesigner: o atendimento oferecido é o herói da tela, com o porquê e o resumo da IA.
  return (
    <article className="atmosphere relative overflow-hidden rounded-[22px] bg-primary p-6 text-primary-foreground shadow-[0_18px_40px_-20px_var(--ink-30)] md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[12px] text-primary-foreground/70">
          <span className="rounded-full border border-primary-foreground/20 px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
            {channelLabel(item.channel)}
          </span>
          Próximo atendimento · {KIND_LABEL[item.kind as WorkKind] ?? item.kind}
        </p>
        <span
          className={
            "rounded-full border px-3 py-1 text-[11.5px] font-medium tabular-nums" +
            (slaMin !== null && slaMin <= 5
              ? "border-danger/50 bg-danger/15 text-primary-foreground"
              : "border-primary-foreground/20 text-primary-foreground/85")
          }
        >
          {slaMin !== null
            ? slaMin <= 0
              ? "Prazo de resposta vencido"
              : `Prazo vence em ${slaMin} min`
            : left > 0
              ? `${left}s para aceitar`
              : "Prazo para aceitar acabou"}
        </span>
      </div>
      <h2 className="mt-5 text-[26px] font-medium tracking-[-0.02em] md:text-[30px]">
        {who ?? item.subject ?? "Atendimento"}
      </h2>
      {who && item.subject ? (
        <p className="mt-2 max-w-[70ch] border-l-2 border-primary-foreground/25 pl-3 text-[14px] italic leading-relaxed text-primary-foreground/80">
          {item.subject}
        </p>
      ) : null}
      {item.summary && (
        <div className="mt-5 rounded-xl border border-primary-foreground/10 bg-primary-foreground/[0.06] p-4">
          <p className="text-[11px] font-medium tracking-wide text-primary-foreground/60">
            Resumo antes de atender
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-primary-foreground/90">
            {item.summary}
          </p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          className="rounded-full bg-primary-foreground px-6 text-primary hover:bg-primary-foreground/90"
          disabled={accept.isPending}
          onClick={() =>
            accept.mutate(item.id, {
              onSuccess: () => toast.success("Atendimento é seu"),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {accept.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Atender agora
        </Button>
        <Button
          variant="ghost"
          className="rounded-full text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          disabled={decline.isPending}
          onClick={() =>
            decline.mutate(item.id, {
              onSuccess: () => toast("Devolvido para a fila"),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          Passar a vez
        </Button>
        {left > 0 && slaMin !== null ? (
          <span className="text-[12px] tabular-nums text-primary-foreground/60">
            {left}s para aceitar
          </span>
        ) : null}
      </div>
    </article>
  );
}

function ActiveCard({ item, accountId }: { item: MyItem; accountId: string }) {
  const finish = useFinishItem(accountId);
  const sp = useSoftphone();
  const [transfer, setTransfer] = useState(false);
  const isCall = item.capacity_class === "voice";
  const manualFinish = ["callback", "cadence_task", "handoff"].includes(item.kind);
  return (
    <article className="row-wash rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <ItemHead item={item} />
        <span className="shrink-0 text-[12px] text-subtle tabular-nums">
          {item.assigned_at ? formatRelative(item.assigned_at) : ""}
        </span>
      </div>
      {item.summary && (
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
          {item.summary}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <SourceLink item={item} />
        {item.kind === "callback" && item.phone && sp && hasChannel("phone") && (
          <Button
            size="sm"
            className="rounded-full"
            disabled={sp.dialing}
            onClick={() =>
              void sp
                .dial({
                  phone: item.phone,
                  contactId: item.contact_id,
                  name: item.contacts?.name ?? null,
                })
                .catch((e: unknown) => toast.error(errorMessage(e)))
            }
          >
            <Phone className="size-4" /> Ligar agora
          </Button>
        )}
        {isCall && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setTransfer(true)}
          >
            <ArrowRightLeft className="size-4" /> Transferir com resumo
          </Button>
        )}
        {manualFinish && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            disabled={finish.isPending}
            onClick={() =>
              finish.mutate(item.id, {
                onSuccess: () => toast.success("Concluído. Confira o pós-atendimento."),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <CheckCircle2 className="size-4" /> Concluir
          </Button>
        )}
      </div>
      {transfer && (
        <TransferDialog item={item} accountId={accountId} onClose={() => setTransfer(false)} />
      )}
    </article>
  );
}

interface Wrap {
  summary?: string;
  reason?: string;
  result?: string;
  next_action?: string;
  next_due_days?: number;
}

function WrapCard({ item, accountId }: { item: MyItem; accountId: string }) {
  const w = (item.wrap ?? {}) as Wrap;
  const ready = Boolean(w.summary);
  const [reason, setReason] = useState(w.reason ?? "");
  const [result, setResult] = useState(w.result ?? "");
  const [next, setNext] = useState(w.next_action ?? "");
  const [days, setDays] = useState(String(w.next_due_days ?? 1));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    setReason(w.reason ?? "");
    setResult(w.result ?? "");
    setNext(w.next_action ?? "");
    setDays(String(w.next_due_days ?? 1));
  }, [w.reason, w.result, w.next_action, w.next_due_days, touched]);
  const confirm = useConfirmWrap(accountId);
  const regen = useRegenerateWrap(accountId);
  const edit =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setTouched(true);
      fn(v);
    };

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <ItemHead item={item} />
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-subtle">
          <Bot className="size-3.5" aria-hidden /> Preenchido pela IA
        </span>
      </div>
      {!ready ? (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-[13px] text-muted-foreground">
            A IA está lendo o atendimento para preencher o resumo. Leva alguns segundos
            {hasChannel("phone") ? " (ligação espera a transcrição)" : ""}.
          </p>
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed">{w.summary}</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`r-${item.id}`}>Motivo do contato</Label>
          <Input
            id={`r-${item.id}`}
            value={reason}
            maxLength={120}
            onChange={(e) => edit(setReason)(e.target.value)}
            placeholder="Ex.: segunda via do boleto"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Resultado</Label>
          <Select value={result} onValueChange={edit(setResult)}>
            <SelectTrigger aria-label="Resultado do atendimento">
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {WRAP_RESULTS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`n-${item.id}`}>Próxima ação (vira tarefa no contato)</Label>
          <Textarea
            id={`n-${item.id}`}
            value={next}
            rows={2}
            maxLength={300}
            onChange={(e) => edit(setNext)(e.target.value)}
            placeholder="Vazio se não ficou nada pendente"
          />
        </div>
        {next.trim() && (
          <div className="space-y-1.5">
            <Label htmlFor={`d-${item.id}`}>Prazo (dias)</Label>
            <Input
              id={`d-${item.id}`}
              type="number"
              min={0}
              max={30}
              value={days}
              onChange={(e) => edit(setDays)(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          className="rounded-full"
          disabled={confirm.isPending || !result}
          onClick={() =>
            confirm.mutate(
              {
                id: item.id,
                reason,
                result,
                next,
                dueDays: Math.min(30, Math.max(0, Number(days) || 1)),
              },
              {
                onSuccess: () => toast.success("Pós-atendimento concluído"),
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          {confirm.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ClipboardCheck className="size-4" />
          )}
          Confirmar
        </Button>
        <Button
          variant="ghost"
          className="rounded-full"
          disabled={regen.isPending}
          onClick={() =>
            regen.mutate(item.id, {
              onSuccess: () => {
                setTouched(false);
                toast("Pedi para a IA preencher de novo");
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <RefreshCw className={cn("size-4", regen.isPending && "animate-spin")} /> Refazer com IA
        </Button>
        {!result && (
          <span className="self-center text-[12px] text-subtle">
            Escolha o resultado para concluir
          </span>
        )}
      </div>
    </article>
  );
}

function NextUp({
  accountId,
  waiting,
  byChannel,
  available,
  blockReason,
}: {
  accountId: string;
  waiting: number;
  byChannel: Record<string, number>;
  available: boolean;
  blockReason: string | null;
}) {
  const claim = useClaimNext(accountId);
  return (
    <section
      aria-labelledby="proximo"
      className="atmosphere relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground"
    >
      <p id="proximo" className="eyebrow !text-primary-foreground/70">
        Próximo atendimento
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-5xl font-semibold tabular-nums">{waiting}</p>
          <p className="text-[13px] text-primary-foreground/80">
            {waiting === 0
              ? "Ninguém esperando agora."
              : `esperando: ${Object.entries(byChannel)
                  .map(([ch, n]) => `${n} ${channelLabel(ch).toLowerCase()}`)
                  .join(", ")}`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="lg"
          className="rounded-full"
          disabled={!available || claim.isPending}
          onClick={() =>
            claim.mutate(undefined, {
              onSuccess: (w) =>
                w
                  ? toast.success(`Pegou: ${w.subject ?? KIND_LABEL[w.kind as WorkKind]}`)
                  : toast(
                      "Nada que você possa pegar agora. A fila respeita habilidade, capacidade e o dono do caso.",
                    ),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {claim.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ListOrdered className="size-4" />
          )}
          Pegar o próximo
        </Button>
      </div>
      {blockReason && <p className="mt-3 text-[12px] text-primary-foreground/80">{blockReason}</p>}
      <p className="mt-3 text-[11px] text-primary-foreground/60">
        Ordem: prazo de resposta acabando, depois cliente de maior valor na carteira, depois ordem
        de chegada. Quem já cuida do caso do cliente recebe primeiro.
      </p>
    </section>
  );
}

export function MyQueuePage() {
  const accountId = useAccountId();
  const { isManager } = useAccount();
  const { user } = useAuth();
  const me = useMyAgent(accountId, user?.id);
  const isAgent = Boolean(me.data?.agent?.is_active);
  const items = useMyItems(accountId, isAgent ? user?.id : undefined);
  const [callback, setCallback] = useState(false);
  useQueueRealtime(accountId, isAgent);
  const now = useNow(5000);

  const list = items.data?.items ?? [];
  const reserved = list.filter((i) => i.status === "reserved" && i.reserved_user_id === user?.id);
  const active = list.filter((i) => i.status === "assigned" && i.assigned_user_id === user?.id);
  const wraps = list.filter((i) => i.status === "wrap_up" && i.assigned_user_id === user?.id);
  const presence = me.data?.presence;
  const wrapLeft =
    presence?.wrap_up_until && new Date(presence.wrap_up_until).getTime() > now
      ? Math.round((new Date(presence.wrap_up_until).getTime() - now) / 1000)
      : 0;
  const blockReason =
    !presence || presence.status === "offline"
      ? "Você está fora da fila. Use o botão de presença no topo do menu para ficar disponível."
      : presence.status === "paused"
        ? `Você está em pausa${presence.pause_reason ? ` (${presence.pause_reason})` : ""}. Volte para Disponível para pegar.`
        : wrapLeft > 0
          ? `Pós-atendimento: mais ${formatSeconds(wrapLeft)} ou confirme abaixo.`
          : null;

  const header = (
    <PageHeader
      title="Minha fila"
      description={
        hasChannel("phone")
          ? "Ligações, conversas, chamados e retornos numa fila só."
          : "Conversas, chamados e tarefas numa fila só."
      }
      actions={
        <>
          {isAgent && hasChannel("phone") && (
            <Button variant="outline" className="rounded-full" onClick={() => setCallback(true)}>
              <PhoneForwarded className="size-4" />{" "}
              <span className="hidden sm:inline">Agendar retorno</span>
            </Button>
          )}
          {isManager && (
            <>
              <Button asChild variant="ghost" className="rounded-full">
                <Link to="/fila/painel" aria-label="Painel ao vivo">
                  <MonitorPlay className="size-4" />{" "}
                  <span className="hidden md:inline">Painel ao vivo</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-full">
                <Link to="/fila/roteamento" aria-label="Fila e roteamento">
                  <Settings2 className="size-4" />{" "}
                  <span className="hidden md:inline">Fila e roteamento</span>
                </Link>
              </Button>
            </>
          )}
        </>
      }
    />
  );

  if (me.isLoading)
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="space-y-3 p-6">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );

  if (me.isError)
    return (
      <div className="flex h-full flex-col">
        {header}
        <EmptyState
          icon={Headphones}
          title="Não deu para abrir a fila"
          description={errorMessage(me.error)}
        />
      </div>
    );

  if (!isAgent)
    return (
      <div className="flex h-full flex-col">
        {header}
        <EmptyState
          icon={Headphones}
          title="Você ainda não está na equipe de atendimento"
          description={
            isManager
              ? "Inclua as pessoas que atendem, com as habilidades de cada uma, e crie pelo menos uma fila."
              : "Peça ao gestor para incluir você na equipe de atendimento."
          }
          action={
            isManager ? (
              <Button asChild className="rounded-full">
                <Link to="/fila/roteamento">Montar a equipe</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <NextUp
              accountId={accountId}
              waiting={items.data?.waiting ?? 0}
              byChannel={items.data?.waitingByChannel ?? {}}
              available={presence?.status === "available" && wrapLeft === 0}
              blockReason={blockReason}
            />
            {items.isError && (
              <p className="rounded-xl border border-danger/40 p-3 text-[13px] text-danger">
                {errorMessage(items.error)}
              </p>
            )}
            {reserved.length > 0 && (
              <section aria-label="Reservados para você" className="space-y-3">
                <h2 className="eyebrow">Reservado para você</h2>
                {reserved.map((i) => (
                  <ReservedCard key={i.id} item={i} accountId={accountId} />
                ))}
              </section>
            )}
            {wraps.length > 0 && (
              <section aria-label="Pós-atendimento" className="space-y-3">
                <h2 className="eyebrow">Pós-atendimento: confira e confirme</h2>
                {wraps.map((i) => (
                  <WrapCard key={i.id} item={i} accountId={accountId} />
                ))}
              </section>
            )}
            <section aria-label="Em atendimento" className="space-y-3">
              <h2 className="eyebrow">Em atendimento ({active.length})</h2>
              {items.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : active.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-5 text-[13px] text-muted-foreground">
                  {hasChannel("phone")
                    ? "Nada com você agora. Fique disponível e use “Pegar o próximo”, ou espere: ligação chega sozinha no seu ramal quando você é a melhor pessoa para atender."
                    : "Nada com você agora. Fique disponível e use “Pegar o próximo”."}
                </p>
              ) : (
                active.map((i) => <ActiveCard key={i.id} item={i} accountId={accountId} />)
              )}
            </section>
          </div>
          <aside className="space-y-3 text-[13px] text-muted-foreground">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="eyebrow mb-2">Sua capacidade</p>
              {hasChannel("phone") ? (
                <p>
                  Ao mesmo tempo: {me.data?.agent?.cap_voice ?? 1} ligação, ou{" "}
                  {me.data?.agent?.cap_chat ?? 4} conversas, ou {me.data?.agent?.cap_email ?? 6}{" "}
                  e-mails. Misturar canais soma a carga.
                </p>
              ) : (
                <p>
                  Ao mesmo tempo: {me.data?.agent?.cap_chat ?? 4} conversas e{" "}
                  {me.data?.agent?.cap_task ?? 6} chamados ou tarefas.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="eyebrow mb-2">
                {hasChannel("phone") ? "Depois de cada ligação" : "Depois de cada atendimento"}
              </p>
              <p>
                A IA escreve o resumo, o motivo e a próxima ação. Você só confere e confirma.
                {hasChannel("phone")
                  ? ` Por ${me.data?.agent?.wrap_up_seconds ?? 60}s nenhuma ligação nova toca para você.`
                  : ""}
              </p>
            </div>
          </aside>
        </div>
      </div>
      {callback && <CallbackDialog accountId={accountId} onClose={() => setCallback(false)} />}
    </div>
  );
}
