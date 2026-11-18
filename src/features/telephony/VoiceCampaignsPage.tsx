import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Megaphone, Pause, Play, Plus, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSegments } from "@/features/segments/api";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  telephonyApi,
  useCampaignProgress,
  voiceAgents,
  voiceCampaigns,
  type VoiceCampaign,
} from "./api";

const STATUS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Ligando",
  paused: "Pausada",
  completed: "Concluída",
  canceled: "Cancelada",
};
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Campanhas de voz: o agente liga para um segmento dentro da janela, sem passar do limite simultâneo.
export function VoiceCampaignsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const campaigns = voiceCampaigns.useList(accountId);
  const agents = voiceAgents.useList(accountId);
  const list = [...(campaigns.data ?? [])].reverse();
  const progress = useCampaignProgress(
    accountId,
    list.map((c) => c.id),
  );
  const [editing, setEditing] = useState<VoiceCampaign | null | "new">(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(c: VoiceCampaign, fn: () => Promise<unknown>, ok: string) {
    setBusy(c.id);
    try {
      await fn();
      toast.success(ok);
      void campaigns.refetch();
      void progress.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Campanhas de voz"
        description="A IA de voz liga para um segmento: confirmação, reativação, qualificação"
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ligacoes">
                <ArrowLeft /> Ligações
              </Link>
            </Button>
            {isManager && (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> Nova campanha
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <p className="mb-4 rounded-2xl border border-border bg-surface-2/50 px-4 py-3 text-[12px] text-muted-foreground">
          Toda ligação respeita a lista de não ligar, o horário de silêncio da conta e a regra da
          Anatel: duas ligações curtas (até 6 s) para o mesmo número pausam esse número por 24 h, e
          cada número recebe no máximo 3 tentativas por dia.
        </p>
        {campaigns.isPending ? (
          <Skeleton className="h-40 rounded-[24px]" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha de voz"
            description="Escolha um segmento e um agente de voz publicado; a IA liga dentro da janela que você definir."
            action={
              isManager && (
                <Button onClick={() => setEditing("new")}>
                  <Plus /> Nova campanha
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {list.map((c) => {
              const p = progress.data?.get(c.id) ?? {};
              const total = Object.values(p).reduce((a, b) => a + b, 0);
              const done =
                (p["done"] ?? 0) + (p["failed"] ?? 0) + (p["skipped"] ?? 0) + (p["dnc"] ?? 0);
              const pct = total ? Math.round((100 * done) / total) : 0;
              const agent = agents.data?.find((a) => a.id === c.voice_agent_id);
              return (
                <li key={c.id} className="rounded-[24px] border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => isManager && setEditing(c)}
                        className="text-left text-[15px] font-semibold hover:underline"
                      >
                        {c.name}
                      </button>
                      <p className="text-[12px] text-subtle">
                        {agent ? `Agente ${agent.name}` : "Sem agente"} ·{" "}
                        {String(c.window_start).slice(0, 5)}–{String(c.window_end).slice(0, 5)} ·{" "}
                        {c.days.map((d) => DAYS[d]).join(", ")} · até {c.max_concurrency}{" "}
                        simultâneas
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        c.status === "running"
                          ? "bg-[#1F8A5B]/10 text-[#1F8A5B]"
                          : "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {STATUS[c.status]}
                    </span>
                    {isManager && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === c.id || c.status === "running"}
                          onClick={() =>
                            void act(
                              c,
                              () => telephonyApi.enroll(accountId, c.id),
                              "Público inscrito",
                            )
                          }
                        >
                          <UserPlus /> Inscrever público
                        </Button>
                        {c.status === "running" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === c.id}
                            onClick={() =>
                              void act(
                                c,
                                () => telephonyApi.campaignStatus(accountId, c.id, "paused"),
                                "Campanha pausada",
                              )
                            }
                          >
                            <Pause /> Pausar
                          </Button>
                        ) : c.status !== "completed" && c.status !== "canceled" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === c.id}
                            onClick={() =>
                              void act(
                                c,
                                () => telephonyApi.campaignStatus(accountId, c.id, "running"),
                                "Campanha iniciada",
                              )
                            }
                          >
                            {busy === c.id ? <Loader2 className="animate-spin" /> : <Play />}{" "}
                            Iniciar
                          </Button>
                        ) : null}
                        {c.status !== "canceled" && c.status !== "completed" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Cancelar campanha"
                            disabled={busy === c.id}
                            onClick={() =>
                              void act(
                                c,
                                () => telephonyApi.campaignStatus(accountId, c.id, "canceled"),
                                "Campanha cancelada",
                              )
                            }
                          >
                            <XCircle />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-[#0A1F3B] transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-4 text-[12px] text-muted-foreground tabular-nums">
                      <span>{total} no público</span>
                      <span>{p["pending"] ?? 0} na fila</span>
                      <span>{p["calling"] ?? 0} ligando</span>
                      <span>{p["done"] ?? 0} atendidas</span>
                      <span>{(p["failed"] ?? 0) + (p["skipped"] ?? 0)} sem sucesso</span>
                      <span>{p["dnc"] ?? 0} não ligar</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <CampaignDialog accountId={accountId} campaign={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CampaignDialog({
  accountId,
  campaign,
  onClose,
}: {
  accountId: string;
  campaign: VoiceCampaign | null | "new";
  onClose: () => void;
}) {
  const save = voiceCampaigns.useSave(accountId);
  const agents = voiceAgents.useList(accountId);
  const segments = useSegments(accountId);
  const [f, setF] = useState({
    name: "",
    voice_agent_id: "",
    segment_id: "",
    window_start: "09:00",
    window_end: "18:00",
    days: [1, 2, 3, 4, 5],
    max_concurrency: 3,
    max_attempts: 2,
    retry_minutes: 120,
    use_batch: false,
  });
  useEffect(() => {
    if (!campaign) return;
    if (campaign === "new") setF((x) => ({ ...x, name: "" }));
    else
      setF({
        name: campaign.name,
        voice_agent_id: campaign.voice_agent_id ?? "",
        segment_id: campaign.segment_id ?? "",
        window_start: String(campaign.window_start).slice(0, 5),
        window_end: String(campaign.window_end).slice(0, 5),
        days: campaign.days,
        max_concurrency: campaign.max_concurrency,
        max_attempts: campaign.max_attempts,
        retry_minutes: campaign.retry_minutes,
        use_batch: campaign.use_batch,
      });
  }, [campaign]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.voice_agent_id || !f.segment_id) {
      toast.error("Informe nome, agente e segmento");
      return;
    }
    try {
      await save.mutateAsync({
        ...(campaign && campaign !== "new" ? { id: campaign.id } : {}),
        values: {
          ...f,
          name: f.name.trim(),
          voice_agent_id: f.voice_agent_id,
          segment_id: f.segment_id,
        },
      });
      toast.success("Campanha salva. Agora inscreva o público e inicie.");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={campaign !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>
              {campaign === "new" ? "Nova campanha de voz" : "Editar campanha"}
            </DialogTitle>
            <DialogDescription>
              Só agentes publicados ligam. A janela usa o fuso da conta.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="vc-name">Nome</Label>
              <Input
                id="vc-name"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder="Ex.: Confirmar reuniões de amanhã"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Agente de voz</Label>
              <Select
                {...(f.voice_agent_id ? { value: f.voice_agent_id } : {})}
                onValueChange={(v) => setF({ ...f, voice_agent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {(agents.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.status !== "published" ? " (rascunho)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Público (segmento)</Label>
              <Select
                {...(f.segment_id ? { value: f.segment_id } : {})}
                onValueChange={(v) => setF({ ...f, segment_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {(segments.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vc-ws">Ligar a partir de</Label>
              <Input
                id="vc-ws"
                type="time"
                value={f.window_start}
                onChange={(e) => setF({ ...f, window_start: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vc-we">Até</Label>
              <Input
                id="vc-we"
                type="time"
                value={f.window_end}
                onChange={(e) => setF({ ...f, window_end: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Dias</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setF({
                        ...f,
                        days: f.days.includes(i)
                          ? f.days.filter((x) => x !== i)
                          : [...f.days, i].sort(),
                      })
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12px]",
                      f.days.includes(i)
                        ? "border-primary bg-primary-soft text-foreground"
                        : "border-border",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Num
              label="Ligações ao mesmo tempo"
              value={f.max_concurrency}
              min={1}
              max={50}
              onChange={(v) => setF({ ...f, max_concurrency: v })}
            />
            <Num
              label="Tentativas por pessoa"
              value={f.max_attempts}
              min={1}
              max={5}
              onChange={(v) => setF({ ...f, max_attempts: v })}
            />
            <Num
              label="Esperar entre tentativas (min)"
              value={f.retry_minutes}
              min={15}
              max={4320}
              onChange={(v) => setF({ ...f, retry_minutes: v })}
            />
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-[13px]">
              <span>
                Lote da ElevenLabs
                <span className="block text-[11px] text-subtle">
                  Manda tudo de uma vez; a janela passa a ser da ElevenLabs.
                </span>
              </span>
              <Switch checked={f.use_batch} onCheckedChange={(c) => setF({ ...f, use_batch: c })} />
            </label>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Num({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Number(e.target.value.replace(/\D/g, "")) || min)))
        }
      />
    </div>
  );
}
