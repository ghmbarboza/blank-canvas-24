import { hasChannel } from "@/lib/edition";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Send, Smile, ThumbsUp } from "lucide-react";
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
import { useSegments } from "@/features/segments/api";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { supportKeys, useCsatResponses, useNpsSurveys } from "./api";

// Pesquisas: NPS por segmento (e-mail ou WhatsApp) e as respostas de CSAT dos chamados.
export function SurveysPanel({ accountId }: { accountId: string }) {
  const { isManager } = useAccount();
  const surveys = useNpsSurveys(accountId);
  const csat = useCsatResponses(accountId);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const send = useMutation({
    mutationFn: (surveyId: string) =>
      callApi<{ sent: number }>("/api/support", { accountId, action: "nps.send", surveyId }),
    onSuccess: (r) => {
      toast.success(`${r.sent} convite${r.sent === 1 ? "" : "s"} na fila de envio`);
      void qc.invalidateQueries({ queryKey: supportKeys.nps(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-medium">
              <ThumbsUp className="size-4 text-subtle" /> NPS
            </h2>
            <p className="text-[12px] text-muted-foreground">
              De 0 a 10, quanto recomendariam a sua empresa. Promotores (9–10) menos detratores
              (0–6).
            </p>
          </div>
          {isManager && (
            // outline: o navy da tela é o "Novo chamado" do topo (uma ação dominante por tela)
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus /> Nova pesquisa
            </Button>
          )}
        </header>
        <ul className="space-y-2">
          {(surveys.data ?? []).length === 0 && (
            <li className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">
              Nenhuma pesquisa ainda. Crie uma para um segmento de clientes e envie
              {hasChannel("email") ? " por e-mail ou WhatsApp." : " pelo WhatsApp."}
            </li>
          )}
          {(surveys.data ?? []).map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{s.name}</p>
                <p className="truncate text-[11px] text-subtle">
                  {s.channel === "email" ? "E-mail" : "WhatsApp"} ·{" "}
                  {s.status === "draft"
                    ? "rascunho"
                    : `${s.sent_count} enviados, ${s.answered} respostas`}
                </p>
              </div>
              {s.nps !== null && (
                <span
                  className={cn(
                    "font-display text-[20px] font-semibold tabular-nums",
                    s.nps < 0 && "text-danger",
                  )}
                >
                  {s.nps}
                </span>
              )}
              {s.status === "draft" && isManager && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() => send.mutate(s.id)}
                >
                  {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-5">
        <header className="mb-4">
          <h2 className="flex items-center gap-2 text-[15px] font-medium">
            <Smile className="size-4 text-subtle" /> CSAT dos chamados
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Enviado sozinho 1 minuto depois que o chamado é resolvido.
          </p>
        </header>
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {(csat.data ?? []).length === 0 && (
            <li className="px-4 py-8 text-center text-[12px] text-muted-foreground">
              Nenhuma pesquisa enviada ainda.
            </li>
          )}
          {(csat.data ?? []).map((c) => (
            <li key={c.id} className="row-wash flex items-center gap-3 rounded-xl px-3 py-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
                  c.score === null
                    ? "bg-surface-2 text-subtle"
                    : c.score >= 4
                      ? "bg-primary text-primary-foreground"
                      : c.score <= 2
                        ? "bg-danger/10 text-danger"
                        : "bg-surface-2",
                )}
              >
                {c.score ?? "—"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">
                  {(c.contacts as unknown as { name: string | null } | null)?.name ?? "Cliente"}
                </p>
                <p className="truncate text-[11px] text-subtle">
                  {c.comment ?? (c.answered_at ? "sem comentário" : "aguardando resposta")}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-subtle">
                {formatRelative(c.answered_at ?? c.sent_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <NewSurveyDialog accountId={accountId} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewSurveyDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const segments = useSegments(accountId);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState(
    "De 0 a 10, quanto você recomendaria a gente para um amigo?",
  );
  // sem o canal e-mail na edição, a pesquisa sai só pelo WhatsApp
  const [channel, setChannel] = useState(hasChannel("email") ? "email" : "whatsapp");
  const [segment, setSegment] = useState("all");
  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("nps_surveys").insert({
        account_id: accountId,
        name: name.trim() || "Pesquisa NPS",
        question: question.trim(),
        channel,
        segment_id: segment === "all" ? null : segment,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pesquisa criada. Revise e clique em Enviar.");
      void qc.invalidateQueries({ queryKey: supportKeys.nps(accountId) });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nova pesquisa NPS</DialogTitle>
            <DialogDescription>
              Quem descadastrou ou pediu para não ser contatado fica de fora automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="nps-name">Nome interno</Label>
              <Input
                id="nps-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: NPS do 4º trimestre"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nps-q">Pergunta</Label>
              <Input id="nps-q" value={question} onChange={(e) => setQuestion(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {hasChannel("email") && (
                <div className="grid gap-1.5">
                  <Label>Canal</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger aria-label="Canal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Para quem</Label>
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger aria-label="Segmento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os contatos</SelectItem>
                    {(segments.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />} Criar pesquisa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
