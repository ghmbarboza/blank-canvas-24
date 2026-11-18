// Instagram e Facebook: comentário com palavra-chave, resposta ao story, menção em story e
// comentário na live viram DM. Quem executa é a Zernio; a conversa da DM cai na Caixa de entrada
// e o agente de IA do Instagram continua dali.
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MessageCircle, PenLine, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { zernio } from "@/features/channels/zernio-api";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

type Trigger = "comment" | "story_reply" | "story_mention" | "live_comment";

interface Row {
  id: string;
  name: string;
  trigger: Trigger;
  triggerLabel: string;
  keywords: string[];
  dmMessage: string;
  isActive: boolean;
  channelName: string;
  platform: string;
  triggered: number;
  dmsSent: number;
}
interface ListResult {
  channels: { id: string; name: string; platform: string; handle: string | null }[];
  automations: Row[];
}

const TRIGGERS: { id: Trigger; label: string; hint: string; igOnly?: boolean }[] = [
  { id: "comment", label: "Comentário no post", hint: "Comentou a palavra, recebe a DM" },
  {
    id: "story_reply",
    label: "Resposta ao story",
    hint: "Respondeu o story com a palavra",
    igOnly: true,
  },
  {
    id: "story_mention",
    label: "Menção em story",
    hint: "Marcou a empresa no story dele",
    igOnly: true,
  },
  {
    id: "live_comment",
    label: "Comentário na live",
    hint: "Comentou durante a live",
    igOnly: true,
  },
];

const key = (a: string) => ["social-automations", a] as const;

export function SocialAutomations({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: key(accountId),
    queryFn: () => zernio<ListResult>(accountId, "social_auto.list"),
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => zernio(accountId, "social_auto.toggle", v),
    onSettled: () => qc.invalidateQueries({ queryKey: key(accountId) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => zernio(accountId, "social_auto.remove", { id }),
    onSettled: () => qc.invalidateQueries({ queryKey: key(accountId) }),
  });
  const [open, setOpen] = useState(false);
  const channels = list.data?.channels ?? [];
  const rows = list.data?.automations ?? [];

  return (
    <section aria-labelledby="social-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="social-title" className="eyebrow text-subtle">
            Instagram e Facebook
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Comentou a palavra-chave, recebe a DM na hora. A conversa entra na Caixa de entrada e o
            agente do Instagram continua.
          </p>
        </div>
        {channels.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus aria-hidden /> Nova automação
          </Button>
        )}
      </div>

      {list.isPending ? (
        <div className="h-20 animate-pulse rounded-2xl bg-surface-2" />
      ) : list.isError ? (
        <p className="rounded-2xl border border-border px-4 py-5 text-[13px] text-muted-foreground">
          {errorMessage(list.error)}
        </p>
      ) : channels.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-5">
          <p className="text-[13px] text-muted-foreground">
            Conecte o Instagram ou o Facebook da empresa para criar automações de comentário e
            story.
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/canais">Conectar redes</Link>
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">
          Nenhuma automação ainda. Exemplo: quem comentar “preço” recebe a tabela no direct.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span aria-hidden className="inline-flex">
                <ChannelIcon platform={a.platform} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{a.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {a.triggerLabel}
                  {a.keywords.length ? ` · ${a.keywords.join(", ")}` : ""} · {a.channelName}
                </p>
              </div>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {formatNumber(a.dmsSent)} {a.dmsSent === 1 ? "DM enviada" : "DMs enviadas"}
              </span>
              <Switch
                checked={a.isActive}
                aria-label={`Ligar ${a.name}`}
                onCheckedChange={(on) =>
                  toggle.mutate({ id: a.id, on }, { onError: (e) => toast.error(errorMessage(e)) })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Apagar ${a.name}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(a.id, {
                    onSuccess: () => toast.success("Automação apagada"),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NewSocialAutomation
          accountId={accountId}
          channels={channels}
          onClose={() => setOpen(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: key(accountId) })}
        />
      )}
    </section>
  );
}

function NewSocialAutomation({
  accountId,
  channels,
  onClose,
  onCreated,
}: {
  accountId: string;
  channels: ListResult["channels"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [trigger, setTrigger] = useState<Trigger>("comment");
  const [keywords, setKeywords] = useState("");
  const [dm, setDm] = useState("");
  const [reply, setReply] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const platform = channels.find((c) => c.id === channelId)?.platform ?? "instagram";
  const options = TRIGGERS.filter((t) => platform === "instagram" || !t.igOnly);

  async function draft() {
    setBusy("draft");
    try {
      const r = await zernio<{ keywords: string[]; dmMessage: string; commentReply: string }>(
        accountId,
        "social_auto.draft",
        { brief, trigger },
      );
      if (trigger !== "story_mention" && r.keywords.length) setKeywords(r.keywords.join(", "));
      setDm(r.dmMessage);
      if (trigger === "comment") setReply(r.commentReply);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      await zernio(accountId, "social_auto.create", {
        channelId,
        trigger,
        keywords: trigger === "story_mention" ? [] : keywords,
        dmMessage: dm,
        commentReply: trigger === "comment" ? reply : "",
        alsoMatchInDms: trigger === "comment",
      });
      toast.success("Automação ligada. Ela responde em segundos.");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg rounded-xl bg-surface">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nova automação de rede social</DialogTitle>
            <DialogDescription>
              Cada pessoa recebe a DM uma vez só. Use {"{{first_name}}"} para chamar pelo nome.
            </DialogDescription>
          </DialogHeader>
          {channels.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="text-[13px] font-medium">Conta</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Conta">
                {channels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={channelId === c.id}
                    onClick={() => setChannelId(c.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${channelId === c.id ? "border-foreground bg-surface-2" : "border-border"}`}
                  >
                    <span aria-hidden className="inline-flex">
                      <ChannelIcon platform={c.platform} size={14} />
                    </span>
                    {c.handle ?? c.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium">Quando</legend>
            <div
              className="grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Quando dispara"
            >
              {options.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={trigger === t.id}
                  onClick={() => setTrigger(t.id)}
                  className={`rounded-lg border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${trigger === t.id ? "border-foreground bg-surface-2" : "border-border hover:bg-surface-2"}`}
                >
                  <span className="block text-[13px] font-medium">{t.label}</span>
                  <span className="block text-[12px] text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5 rounded-lg border border-border p-3">
            <Label htmlFor="sa-brief">Peça para a IA escrever (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="sa-brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Ex.: mandar a tabela de preços do clareamento"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void draft()}
                disabled={busy !== null || brief.trim().length < 5}
              >
                {busy === "draft" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <PenLine aria-hidden />
                )}
                Escrever
              </Button>
            </div>
          </div>
          {trigger !== "story_mention" && (
            <div className="space-y-1.5">
              <Label htmlFor="sa-kw">Palavras-chave (separe por vírgula)</Label>
              <Input
                id="sa-kw"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="preço, quero, link"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sa-dm">Mensagem da DM</Label>
            <Textarea
              id="sa-dm"
              rows={3}
              value={dm}
              maxLength={1000}
              onChange={(e) => setDm(e.target.value)}
            />
          </div>
          {trigger === "comment" && (
            <div className="space-y-1.5">
              <Label htmlFor="sa-reply">Resposta pública no comentário (opcional)</Label>
              <Input
                id="sa-reply"
                value={reply}
                maxLength={300}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Te chamei no direct!"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy !== null || dm.trim().length < 2}>
              {busy === "save" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <MessageCircle aria-hidden />
              )}
              Ligar automação
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
