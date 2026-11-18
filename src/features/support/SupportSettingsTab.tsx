import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { patchAccountSettings } from "@/features/settings/api";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { MacroIntentsField, MacroVariablesHint } from "./MacroFields";
import {
  useDeleteQuickReply,
  useQuickReplies,
  useSaveQuickReply,
  useSaveSlaPolicies,
  useSlaPolicies,
  type QuickReply,
} from "./api";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "./constants";
import { SlaPlanRulesCard } from "./SlaPlanRulesCard";

const DEFAULT_SLA: Record<string, [number, number]> = {
  urgent: [30, 240],
  high: [60, 480],
  normal: [240, 1440],
  low: [480, 4320],
};
const DAYS = [
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
  [7, "Dom"],
] as const;

interface BusinessHours {
  days: number[];
  start: string;
  end: string;
  always?: boolean;
}

// Ajustes do atendimento: horário útil, prazos de SLA por prioridade e por plano, respostas rápidas.
export function SupportSettingsTab() {
  return (
    <div className="space-y-6">
      <BusinessHoursCard />
      <SlaCard />
      <SlaPlanRulesCard />
      <QuickRepliesCard />
    </div>
  );
}

function BusinessHoursCard() {
  const { current, isManager } = useAccount();
  const qc = useQueryClient();
  const saved = ((current!.settings as Record<string, unknown>)["business_hours"] as
    BusinessHours | undefined) ?? { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };
  const [bh, setBh] = useState<BusinessHours>(saved);
  useEffect(() => setBh(saved), [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  const savedAway = ((current!.settings as Record<string, unknown>)["away_message"] as
    { enabled?: boolean; text?: string } | undefined) ?? { enabled: false, text: "" };
  const [away, setAway] = useState(savedAway);
  const savedCsat = Boolean((current!.settings as Record<string, unknown>)["csat_on_close"]);
  const [csatOnClose, setCsatOnClose] = useState(savedCsat);
  useEffect(() => setCsatOnClose(savedCsat), [savedCsat]);
  useEffect(() => setAway(savedAway), [JSON.stringify(savedAway)]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () =>
      patchAccountSettings(current!.accountId, (cur) => ({
        ...cur,
        business_hours: bh as never,
        away_message: { enabled: Boolean(away.enabled), text: (away.text ?? "").slice(0, 1000) },
        csat_on_close: csatOnClose,
      })),
    onSuccess: () => {
      toast.success("Horário de atendimento salvo");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsCard
      title="Horário de atendimento"
      description="O prazo do SLA só corre dentro deste horário. O agente de IA pode responder só nele, se você quiser."
      readOnlyNote={isManager ? undefined : "Só gestores alteram o horário."}
    >
      <div className="grid gap-4">
        <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-[13px]">
          Atendimento 24 horas, todos os dias
          <Switch
            checked={Boolean(bh.always)}
            onCheckedChange={(c) => setBh({ ...bh, always: c })}
            disabled={!isManager}
          />
        </label>
        {!bh.always && (
          <>
            <div className="flex flex-wrap gap-3">
              {DAYS.map(([n, label]) => (
                <label key={n} className="flex items-center gap-1.5 text-[13px]">
                  <Checkbox
                    checked={bh.days.includes(n)}
                    disabled={!isManager}
                    onCheckedChange={(c) =>
                      setBh({
                        ...bh,
                        days: c ? [...bh.days, n].sort() : bh.days.filter((d) => d !== n),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bh-start">Abre</Label>
                <Input
                  id="bh-start"
                  type="time"
                  value={bh.start}
                  onChange={(e) => setBh({ ...bh, start: e.target.value })}
                  disabled={!isManager}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bh-end">Fecha</Label>
                <Input
                  id="bh-end"
                  type="time"
                  value={bh.end}
                  onChange={(e) => setBh({ ...bh, end: e.target.value })}
                  disabled={!isManager}
                />
              </div>
            </div>
          </>
        )}
        {!bh.always && (
          <div className="grid gap-2 rounded-xl border border-border px-4 py-3">
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span>
                Responder sozinho fora do horário
                <span className="block text-muted-foreground">
                  Uma mensagem por conversa a cada 12 h, só se ninguém (nem a IA) responder antes.
                  No e-mail não vai: ele tem a resposta automática do próprio servidor.
                </span>
              </span>
              <Switch
                checked={Boolean(away.enabled)}
                onCheckedChange={(c) => setAway({ ...away, enabled: c })}
                disabled={!isManager}
                aria-label="Responder sozinho fora do horário"
              />
            </label>
            {away.enabled && (
              <div className="grid gap-1.5">
                <Label htmlFor="away-text">Mensagem</Label>
                <Textarea
                  id="away-text"
                  rows={3}
                  maxLength={1000}
                  value={away.text ?? ""}
                  onChange={(e) => setAway({ ...away, text: e.target.value })}
                  placeholder="Oi! Recebemos sua mensagem. Estamos fora do horário de atendimento agora e respondemos assim que voltarmos."
                  disabled={!isManager}
                />
              </div>
            )}
          </div>
        )}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-[13px]">
          <span>
            Pesquisa de satisfação ao resolver a conversa
            <span className="block text-muted-foreground">
              Um minuto depois de resolver, o cliente recebe o link de avaliação no mesmo canal. No
              máximo uma pesquisa por cliente a cada 7 dias.
            </span>
          </span>
          <Switch
            checked={csatOnClose}
            onCheckedChange={setCsatOnClose}
            disabled={!isManager}
            aria-label="Pesquisa de satisfação ao resolver a conversa"
          />
        </label>
        {isManager && (
          <div>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (!bh.always && bh.days.length === 0)}
            >
              {save.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function toText(m: number) {
  return m % 60 === 0 ? `${m / 60}` : (m / 60).toFixed(1).replace(".", ",");
}

function SlaCard() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const policies = useSlaPolicies(accountId);
  const save = useSaveSlaPolicies(accountId);
  const [rows, setRows] = useState<Record<string, { first: string; res: string; bh: boolean }>>({});
  useEffect(() => {
    const next: typeof rows = {};
    for (const p of PRIORITY_ORDER) {
      const found = (policies.data ?? []).find((x) => x.priority === p);
      const [f, r] = DEFAULT_SLA[p]!;
      next[p] = {
        first: toText(found?.first_response_minutes ?? f),
        res: toText(found?.resolution_minutes ?? r),
        bh: found?.business_hours ?? true,
      };
    }
    setRows(next);
  }, [policies.data]);

  function submit() {
    const payload = PRIORITY_ORDER.map((p) => {
      const r = rows[p]!;
      return {
        priority: p,
        first_response_minutes: Math.round(Number(r.first.replace(",", ".")) * 60),
        resolution_minutes: Math.round(Number(r.res.replace(",", ".")) * 60),
        business_hours: r.bh,
      };
    });
    if (payload.some((p) => !(p.first_response_minutes > 0) || !(p.resolution_minutes > 0))) {
      toast.error("Use horas maiores que zero");
      return;
    }
    save.mutate(payload, {
      onSuccess: () => toast.success("Prazos salvos. Valem para os próximos chamados."),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <SettingsCard
      title="Prazos (SLA)"
      description="Quanto tempo a equipe tem para a primeira resposta e para resolver, por prioridade. Avisamos o responsável antes de vencer."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-subtle">
              <th className="pb-2 font-medium">Prioridade</th>
              <th className="pb-2 font-medium">1ª resposta (horas)</th>
              <th className="pb-2 font-medium">Solução (horas)</th>
              <th className="pb-2 font-medium">Só horário útil</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITY_ORDER.map((p) => {
              const r = rows[p];
              if (!r) return null;
              const set = (patch: Partial<typeof r>) =>
                setRows({ ...rows, [p]: { ...r, ...patch } });
              return (
                <tr key={p} className="border-t border-border">
                  <td className="py-2 font-medium">{PRIORITY_LABEL[p]}</td>
                  <td className="py-2 pr-3">
                    <Input
                      className="h-8 w-24"
                      inputMode="decimal"
                      value={r.first}
                      onChange={(e) => set({ first: e.target.value })}
                      disabled={!isManager}
                      aria-label={`1ª resposta ${PRIORITY_LABEL[p]}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      className="h-8 w-24"
                      inputMode="decimal"
                      value={r.res}
                      onChange={(e) => set({ res: e.target.value })}
                      disabled={!isManager}
                      aria-label={`Solução ${PRIORITY_LABEL[p]}`}
                    />
                  </td>
                  <td className="py-2">
                    <Switch
                      checked={r.bh}
                      onCheckedChange={(c) => set({ bh: c })}
                      disabled={!isManager}
                      aria-label="Só horário útil"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isManager && (
        <Button variant="outline" className="mt-4" onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} Salvar prazos
        </Button>
      )}
    </SettingsCard>
  );
}

function QuickRepliesCard() {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const replies = useQuickReplies(accountId);
  const remove = useDeleteQuickReply(accountId);
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  return (
    <SettingsCard
      title="Respostas rápidas"
      description="Digite / na caixa de mensagem para usar. Use {nome} para o primeiro nome do cliente."
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus /> Nova resposta
        </Button>
      }
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(replies.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma resposta rápida. Ex.: /pix com os dados de pagamento.
          </li>
        )}
        {(replies.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <Zap className="size-4 shrink-0 text-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">
                <span className="font-mono text-subtle">/{r.shortcut}</span> · {r.title}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">{r.body}</p>
            </div>
            <button
              type="button"
              aria-label="Editar"
              onClick={() => setEditing(r)}
              className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Excluir"
              onClick={() => remove.mutate(r.id, { onError: (e) => toast.error(errorMessage(e)) })}
              className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <QuickReplyDialog accountId={accountId} reply={editing} onClose={() => setEditing(null)} />
    </SettingsCard>
  );
}

function QuickReplyDialog({
  accountId,
  reply,
  onClose,
}: {
  accountId: string;
  reply: QuickReply | "new" | null;
  onClose: () => void;
}) {
  const save = useSaveQuickReply(accountId);
  const existing = reply && reply !== "new" ? reply : null;
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(true);
  const [intents, setIntents] = useState<string[]>([]);
  useEffect(() => {
    if (!reply) return;
    setIntents(existing?.intents ?? []);
    setShortcut(existing?.shortcut ?? "");
    setTitle(existing?.title ?? "");
    setBody(existing?.body ?? "");
    setShared(existing?.is_shared ?? true);
  }, [reply, existing]);
  return (
    <Dialog open={Boolean(reply)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const sc = shortcut
              .trim()
              .toLowerCase()
              .replace(/^\//, "")
              .replace(/[^a-z0-9_-]/g, "");
            if (!sc || !title.trim() || !body.trim()) {
              toast.error("Preencha atalho, título e texto");
              return;
            }
            save.mutate(
              {
                ...(existing ? { id: existing.id } : {}),
                shortcut: sc,
                title: title.trim(),
                body: body.trim(),
                is_shared: shared,
                intents,
              },
              {
                onSuccess: () => {
                  toast.success("Resposta salva");
                  onClose();
                },
                onError: (er) =>
                  toast.error(
                    errorMessage(er).includes("quick_replies_account_id_shortcut")
                      ? "Já existe esse atalho"
                      : errorMessage(er),
                  ),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {existing ? "Editar resposta rápida" : "Nova resposta rápida"}
            </DialogTitle>
            <DialogDescription>
              Ela aparece quando alguém digita /{shortcut || "atalho"} na conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="qr-sc">Atalho</Label>
                <Input
                  id="qr-sc"
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value)}
                  placeholder="pix"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qr-title">Título</Label>
                <Input
                  id="qr-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Dados do Pix"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qr-body">Texto</Label>
              <Textarea
                id="qr-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Oi {{contato.primeiro_nome}}! Nossa chave Pix é…"
              />
              <MacroVariablesHint
                onInsert={(t) => setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}${t}`)}
              />
            </div>
            <MacroIntentsField value={intents} onChange={setIntents} />
            <label className="flex items-center justify-between text-[13px]">
              Disponível para toda a equipe
              <Switch checked={shared} onCheckedChange={setShared} />
            </label>
          </div>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
