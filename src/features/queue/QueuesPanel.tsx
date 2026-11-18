import { hasChannel } from "@/lib/edition";
import { useState } from "react";
import { ListOrdered, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";

import { useQueues, useSaveQueue, type Queue } from "./api";
import {
  OVERFLOW_LABEL as OVERFLOW,
  describeQueue,
  channelLabel,
  normalizeSkill,
  queueChannelVisible,
} from "./lib";

const ALL_CHANNELS = [
  "voice",
  "whatsapp_call",
  "whatsapp",
  "instagram",
  "facebook",
  "webchat",
  "email",
  "ticket",
];
// só os canais da edição (ver src/lib/edition.ts)
const CHANNELS = ALL_CHANNELS.filter((c) => queueChannelVisible(c));
const PHONE = hasChannel("phone");
interface Draft {
  name: string;
  channels: string[];
  skill: string;
  level: number;
  sla: number;
  overflow: string;
  redirect: string;
  active: boolean;
}

function toDraft(q?: Queue): Draft {
  return {
    name: q?.name ?? "",
    channels: q?.channels ?? (PHONE ? ["voice", "whatsapp"] : ["whatsapp"]),
    skill: q?.skills[0] ?? "",
    level: q?.required_level ?? 1,
    sla: q?.sla_seconds ?? 20,
    overflow: q?.overflow ?? "callback",
    redirect: q?.overflow_redirect ?? "",
    active: q?.is_active ?? true,
  };
}

export function QueueForm({
  queue,
  accountId,
  onDone,
}: {
  queue?: Queue;
  accountId: string;
  onDone: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(queue));
  const save = useSaveQueue(accountId);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const redirectOk = !d.redirect || /^([0-9]{1,6}|[0-9]+-[0-9a-z]+)$/.test(d.redirect.trim());
  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          {
            ...(queue ? { id: queue.id } : {}),
            patch: {
              name: d.name.trim(),
              channels: d.channels,
              skills: d.skill.trim() ? [normalizeSkill(d.skill)] : [],
              required_level: d.level,
              sla_seconds: Math.min(600, Math.max(5, d.sla)),
              overflow: d.overflow,
              overflow_redirect: d.redirect.trim() || null,
              is_active: d.active,
            },
          },
          {
            onSuccess: () => {
              toast.success(queue ? "Fila salva" : "Fila criada");
              onDone();
            },
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="q-name">Nome da fila</Label>
          <Input
            id="q-name"
            required
            maxLength={80}
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex.: Suporte, Financeiro, Vendas"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-skill">Habilidade exigida</Label>
          <Input
            id="q-skill"
            maxLength={40}
            value={d.skill}
            onChange={(e) => set("skill", e.target.value)}
            placeholder="Vazio = qualquer pessoa"
          />
        </div>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Canais que entram nesta fila</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={d.channels.includes(c)}
                onCheckedChange={(v) =>
                  set("channels", v ? [...d.channels, c] : d.channels.filter((x) => x !== c))
                }
              />
              {channelLabel(c)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Nível mínimo</Label>
          <Select value={String(d.level)} onValueChange={(v) => set("level", Number(v))}>
            <SelectTrigger aria-label="Nível mínimo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((l) => (
                <SelectItem key={l} value={String(l)}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {PHONE && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="q-sla">Atender ligação em até (s)</Label>
              <Input
                id="q-sla"
                type="number"
                min={5}
                max={600}
                value={d.sla}
                onChange={(e) => set("sla", Number(e.target.value) || 20)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ninguém livre</Label>
              <Select value={d.overflow} onValueChange={(v) => set("overflow", v)}>
                <SelectTrigger aria-label="Ninguém livre">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OVERFLOW).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      {PHONE && d.overflow === "ai" && (
        <div className="space-y-1.5">
          <Label htmlFor="q-redirect">Ramal ou cenário da Zadarma que leva à IA de voz</Label>
          <Input
            id="q-redirect"
            value={d.redirect}
            onChange={(e) => set("redirect", e.target.value)}
            placeholder="Ex.: 105 ou 0-2"
            aria-invalid={!redirectOk}
          />
          <p className="text-[12px] text-muted-foreground">
            É o ramal (ou cenário da URA) que encaminha para o agente de voz por SIP. A IA segura a
            ligação e oferece retorno ou WhatsApp.
          </p>
        </div>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <Switch checked={d.active} onCheckedChange={(v) => set("active", v)} /> Fila ativa
      </label>
      <p className="rounded-lg bg-surface-2 p-3 text-[13px]">
        {describeQueue({
          channels: d.channels,
          skills: d.skill.trim() ? [normalizeSkill(d.skill)] : [],
          required_level: d.level,
          sla_seconds: d.sla,
          overflow: d.overflow,
        })}
      </p>
      <div className="flex gap-2">
        <Button
          type="submit"
          className="rounded-full"
          disabled={!d.name.trim() || !d.channels.length || !redirectOk || save.isPending}
        >
          {queue ? "Salvar fila" : "Criar fila"}
        </Button>
        <Button type="button" variant="ghost" className="rounded-full" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Filas: por onde entra, quem atende, prazo e o que acontece quando ninguém está livre. */
export function QueuesPanel({ accountId }: { accountId: string }) {
  const queues = useQueues(accountId);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  if (queues.isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (queues.isError)
    return <p className="text-[13px] text-danger">{errorMessage(queues.error)}</p>;
  const list = queues.data ?? [];
  return (
    <div className="space-y-3">
      {list.length === 0 && editing !== "new" && (
        <EmptyState
          icon={ListOrdered}
          title="Nenhuma fila ainda"
          description="Crie uma fila para cada tipo de atendimento (ex.: Suporte e Vendas). Sem fila, tudo entra sem habilidade exigida."
          action={
            <Button className="rounded-full" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Criar a primeira fila
            </Button>
          }
        />
      )}
      {list.map((q) =>
        editing === q.id ? (
          <QueueForm key={q.id} queue={q} accountId={accountId} onDone={() => setEditing(null)} />
        ) : (
          <article
            key={q.id}
            className="row-wash flex items-start gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">
                {q.name}
                {!q.is_active && (
                  <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    desligada
                  </span>
                )}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">{describeQueue(q)}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => setEditing(q.id)}
              aria-label={`Editar ${q.name}`}
            >
              <Pencil className="size-4" />
            </Button>
          </article>
        ),
      )}
      {editing === "new" ? (
        <QueueForm accountId={accountId} onDone={() => setEditing(null)} />
      ) : (
        list.length > 0 && (
          <Button variant="outline" className="rounded-full" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Nova fila
          </Button>
        )
      )}
    </div>
  );
}
