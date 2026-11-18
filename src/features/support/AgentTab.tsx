import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  Send,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useBookingPages } from "@/features/booking/api";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { patchAccountSettings } from "@/features/settings/api";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { supportKeys, useAgentRuns, useEvalCases } from "./api";

interface AgentForm {
  enabled: boolean;
  persona: string;
  tone: string;
  rules: string;
  handoff_message: string;
  debounce_seconds: number;
  max_replies_per_conversation: number;
  business_hours_only: boolean;
  scheduling_enabled: boolean;
  booking_slug: string;
}

const DEFAULTS: AgentForm = {
  enabled: false,
  persona: "Assistente da empresa",
  tone: "cordial, direto e em português do Brasil",
  rules: "",
  handoff_message:
    "Vou chamar alguém da equipe para te ajudar com isso. Já já te respondem por aqui.",
  debounce_seconds: 8,
  max_replies_per_conversation: 12,
  business_hours_only: false,
  scheduling_enabled: false,
  booking_slug: "",
};

interface Decision {
  action: "reply" | "handoff" | "skip";
  reply: string;
  reason: string;
  confidence: number;
  sources: { kind: string; title: string }[];
  problems: string[];
  ms: number;
}

interface EvalResult {
  case_id: string;
  question: string;
  action: string;
  reply: string;
  reason: string;
  passed: boolean;
  grade: string;
}

const META = 0.9;

// Agente de IA que responde (issue #3): configuração, teste ao vivo e suíte de perguntas reais (meta 90%).
export function AgentTab() {
  return (
    <div className="space-y-6">
      <AgentSettingsCard />
      <PlaygroundCard />
      <EvalSuiteCard />
      <RecentRunsCard />
    </div>
  );
}

function AgentSettingsCard() {
  const { current, isManager } = useAccount();
  const qc = useQueryClient();
  const saved = {
    ...DEFAULTS,
    ...((current!.settings as Record<string, unknown>)["ai_agent"] as
      Partial<AgentForm> | undefined),
  };
  const [f, setF] = useState<AgentForm>(saved);
  useEffect(() => setF(saved), [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      patchAccountSettings(current!.accountId, (cur) => ({ ...cur, ai_agent: f as never })),
    onSuccess: () => {
      toast.success(
        f.enabled
          ? "Agente ligado. Ele responde nos canais e conversas com IA ativada."
          : "Configuração salva",
      );
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsCard
      title="Agente de IA que responde"
      description="Ele lê a base de conhecimento, o catálogo e o histórico, escreve a resposta e passa para a equipe quando não sabe, quando pedem uma pessoa ou quando o cliente está irritado. Nunca inventa preço nem prazo."
      readOnlyNote={isManager ? undefined : "Só gestores configuram o agente."}
    >
      <div className="grid gap-4">
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-2/40 px-4 py-3">
          <span>
            <span className="text-[14px] font-semibold">Responder sozinho</span>
            <span className="block text-[12px] text-muted-foreground">
              Vale para canais e conversas com a IA ligada (botão na conversa e em Canais).
            </span>
          </span>
          <Switch
            checked={f.enabled}
            onCheckedChange={(c) => set("enabled", c)}
            disabled={!isManager}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ag-persona">Como ele se apresenta</Label>
            <Input
              id="ag-persona"
              value={f.persona}
              onChange={(e) => set("persona", e.target.value)}
              disabled={!isManager}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ag-tone">Tom de voz</Label>
            <Input
              id="ag-tone"
              value={f.tone}
              onChange={(e) => set("tone", e.target.value)}
              disabled={!isManager}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ag-rules">Regras da empresa</Label>
          <Textarea
            id="ag-rules"
            rows={4}
            value={f.rules}
            onChange={(e) => set("rules", e.target.value)}
            disabled={!isManager}
            placeholder="Ex.: Não fazemos entrega no domingo. Para orçamento acima de 10 unidades, passar para o comercial."
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ag-handoff">Mensagem ao passar para a equipe</Label>
          <Input
            id="ag-handoff"
            value={f.handoff_message}
            onChange={(e) => set("handoff_message", e.target.value)}
            disabled={!isManager}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ag-wait">Esperar o cliente terminar (segundos)</Label>
            <Input
              id="ag-wait"
              inputMode="numeric"
              value={f.debounce_seconds}
              onChange={(e) =>
                set(
                  "debounce_seconds",
                  Math.max(5, Math.min(300, Number(e.target.value.replace(/\D/g, "")) || 5)),
                )
              }
              disabled={!isManager}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ag-max">Máximo de respostas por conversa por dia</Label>
            <Input
              id="ag-max"
              inputMode="numeric"
              value={f.max_replies_per_conversation}
              onChange={(e) =>
                set(
                  "max_replies_per_conversation",
                  Math.max(1, Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 1)),
                )
              }
              disabled={!isManager}
            />
          </div>
          <label className="flex items-end justify-between gap-3 pb-2 text-[13px]">
            Só no horário de atendimento
            <Switch
              checked={f.business_hours_only}
              onCheckedChange={(c) => set("business_hours_only", c)}
              disabled={!isManager}
            />
          </label>
        </div>
        <SchedulingFields
          accountId={current!.accountId}
          enabled={f.scheduling_enabled}
          slug={f.booking_slug}
          disabled={!isManager}
          onChange={(enabled, slug) =>
            setF((s) => ({ ...s, scheduling_enabled: enabled, booking_slug: slug }))
          }
        />
        <p className="text-[12px] text-muted-foreground">
          Conteúdo vem da{" "}
          <Link to="/atendimento/base" className="underline">
            base de conhecimento
          </Link>{" "}
          e do catálogo. A IA já vem inclusa.
        </p>
        {isManager && (
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar agente
            </Button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

// Marcar reunião pela conversa: a IA vê os horários livres da página escolhida e marca quando o cliente escolhe.
function SchedulingFields({
  accountId,
  enabled,
  slug,
  disabled,
  onChange,
}: {
  accountId: string;
  enabled: boolean;
  slug: string;
  disabled: boolean;
  onChange: (enabled: boolean, slug: string) => void;
}) {
  const pages = useBookingPages(accountId);
  const active = (pages.data ?? []).filter((p) => p.is_active);
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-surface-2/40 px-4 py-3">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="text-[14px] font-semibold">Marcar reuniões</span>
          <span className="block text-[12px] text-muted-foreground">
            A IA oferece horários livres e marca na agenda quando o cliente escolhe. O convite com o
            link chega por mensagem.
          </span>
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={(c) => onChange(c, slug || active[0]?.slug || "")}
          disabled={disabled || active.length === 0}
        />
      </label>
      {active.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Crie uma{" "}
          <Link to="/agendamentos" className="underline">
            página de agendamento
          </Link>{" "}
          para ligar esta opção.
        </p>
      ) : (
        enabled && (
          <div className="grid gap-1.5">
            <Label htmlFor="ag-booking">Usar os horários da página</Label>
            <Select value={slug} onValueChange={(v) => onChange(true, v)} disabled={disabled}>
              <SelectTrigger id="ag-booking">
                <SelectValue placeholder="Escolha a página" />
              </SelectTrigger>
              <SelectContent>
                {active.map((p) => (
                  <SelectItem key={p.id} value={p.slug}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      )}
    </div>
  );
}

function PlaygroundCard() {
  const { current, isManager } = useAccount();
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string; d?: Decision }[]>(
    [],
  );
  const test = useMutation({
    mutationFn: (q: string) =>
      callApi<Decision>("/api/support", {
        accountId: current!.accountId,
        action: "agent.test",
        question: q,
        history: chat.map(({ role, content }) => ({ role, content })),
      }),
    onSuccess: (d, q) => {
      setChat((c) => [
        ...c,
        { role: "user", content: q },
        { role: "assistant", content: d.reply, d },
      ]);
      setQuestion("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!isManager) return null;
  return (
    <SettingsCard
      title="Testar o agente"
      description="Converse como se fosse um cliente. Nada é enviado de verdade; mostramos a decisão e as fontes usadas."
    >
      <div className="rounded-2xl border border-border bg-surface-2/30">
        <ul className="max-h-96 space-y-3 overflow-y-auto p-4">
          {chat.length === 0 && (
            <li className="py-6 text-center text-[12px] text-muted-foreground">
              Pergunte algo que seus clientes perguntam.
            </li>
          )}
          {chat.map((m, i) => (
            <li key={i} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && <Bot className="mt-1 size-4 shrink-0 text-subtle" />}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-[13px]",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface",
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.d && (
                  <div className="mt-2 border-t border-border pt-2 text-[11px] text-subtle">
                    <p>
                      {m.d.action === "handoff" ? "Passou para a equipe" : "Respondeu"} · confiança{" "}
                      {Math.round(m.d.confidence * 100)}% · {m.d.ms} ms
                    </p>
                    <p>Motivo: {m.d.reason}</p>
                    {m.d.sources.length > 0 && (
                      <p>Fontes: {m.d.sources.map((s) => s.title).join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
              {m.role === "user" && <UserRound className="mt-1 size-4 shrink-0 text-subtle" />}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) test.mutate(question.trim());
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex.: vocês parcelam no cartão?"
            aria-label="Pergunta de teste"
          />
          <Button
            type="submit"
            aria-label="Enviar pergunta de teste"
            disabled={test.isPending || !question.trim()}
          >
            {test.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
          {chat.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setChat([])}>
              Limpar
            </Button>
          )}
        </form>
      </div>
    </SettingsCard>
  );
}

function EvalSuiteCard() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const qc = useQueryClient();
  const evals = useEvalCases(accountId);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [handoff, setHandoff] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ai_eval_cases").insert({
        account_id: accountId,
        question: question.trim(),
        expected: expected.trim() || null,
        must_handoff: handoff,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setQuestion("");
      setExpected("");
      setHandoff(false);
      void qc.invalidateQueries({ queryKey: supportKeys.evals(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_eval_cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.evals(accountId) }),
  });

  async function runAll() {
    const cases = evals.data?.cases ?? [];
    if (cases.length === 0) return;
    const out: EvalResult[] = [];
    setRunning({ done: 0, total: cases.length });
    try {
      for (let i = 0; i < cases.length; i += 6) {
        const batch = cases.slice(i, i + 6).map((c) => c.id);
        const r = await callApi<{ results: EvalResult[] }>("/api/support", {
          accountId,
          action: "eval.run",
          caseIds: batch,
        });
        out.push(...r.results);
        setRunning({ done: out.length, total: cases.length });
      }
      setResults(out);
      const saved = await callApi<{ accept_rate: number | null }>("/api/support", {
        accountId,
        action: "eval.save",
        results: out,
      });
      void qc.invalidateQueries({ queryKey: supportKeys.evals(accountId) });
      const rate = saved.accept_rate ?? 0;
      toast[rate >= META ? "success" : "error"](
        `Aceite de ${Math.round(rate * 100)}% (meta ${META * 100}%)`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(null);
    }
  }

  const last = evals.data?.runs[0];
  return (
    <SettingsCard
      title="Suíte de perguntas reais"
      description="Antes de ligar o agente, cadastre as perguntas que seus clientes fazem e o que a resposta precisa conter. A meta é 90% de aceite."
      actions={
        isManager && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void runAll()}
            disabled={Boolean(running) || !evals.data?.cases.length}
          >
            {running ? <Loader2 className="animate-spin" /> : <FlaskConical />}{" "}
            {running ? `${running.done}/${running.total}` : "Rodar suíte"}
          </Button>
        )
      }
    >
      {last && (
        <div
          className={cn(
            "mb-4 flex items-center justify-between rounded-2xl px-4 py-3",
            (last.accept_rate ?? 0) >= META
              ? "bg-[#001F35] text-white"
              : "bg-danger/10 text-danger",
          )}
        >
          <span className="text-[13px]">
            Última rodada · {formatRelative(last.created_at)} · {last.passed} de {last.total}
          </span>
          <span className="font-display text-[24px] font-semibold tabular-nums">
            {Math.round((last.accept_rate ?? 0) * 100)}%
          </span>
        </div>
      )}
      {isManager && (
        <form
          className="mb-4 grid gap-2 rounded-2xl border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) add.mutate();
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pergunta do cliente"
            aria-label="Pergunta"
          />
          <Input
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="A resposta deve conter (separe por ;) — ex.: pix; cartão em 3x"
            aria-label="Esperado"
            disabled={handoff}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={handoff} onCheckedChange={(c) => setHandoff(Boolean(c))} /> O certo
              é passar para a equipe
            </label>
            <Button type="submit" size="sm" disabled={add.isPending || !question.trim()}>
              <Plus /> Adicionar
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(evals.data?.cases ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma pergunta cadastrada.
          </li>
        )}
        {(evals.data?.cases ?? []).map((c) => {
          const r = results?.find((x) => x.case_id === c.id);
          return (
            <li key={c.id} className="flex items-start gap-3 px-4 py-2.5">
              {r ? (
                r.passed ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                )
              ) : (
                <FlaskConical className="mt-0.5 size-4 shrink-0 text-subtle" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">{c.question}</p>
                <p className="text-[11px] text-subtle">
                  {c.must_handoff
                    ? "Esperado: passar para a equipe"
                    : c.expected
                      ? `Deve conter: ${c.expected}`
                      : "Sem critério"}
                </p>
                {r && (
                  <p
                    className={cn(
                      "mt-1 text-[12px]",
                      r.passed ? "text-muted-foreground" : "text-danger",
                    )}
                  >
                    {r.grade} — “{r.reply.slice(0, 160)}”
                  </p>
                )}
              </div>
              {isManager && (
                <button
                  type="button"
                  aria-label="Excluir pergunta"
                  onClick={() => remove.mutate(c.id)}
                  className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

function RecentRunsCard() {
  const { current } = useAccount();
  const runs = useAgentRuns(current!.accountId);
  const label: Record<string, string> = {
    replied: "Respondeu",
    handoff: "Passou para a equipe",
    skipped: "Não respondeu",
    error: "Erro",
    queued: "Na fila",
  };
  return (
    <SettingsCard
      title="O que o agente fez"
      description="As últimas decisões, com o motivo. Clique para abrir a conversa."
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(runs.data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma execução ainda.
          </li>
        )}
        {(runs.data ?? []).map((r) => (
          <li key={r.id}>
            <Link
              to="/inbox/$conversationId"
              params={{ conversationId: r.conversation_id }}
              className="row-wash flex items-center gap-3 px-4 py-2.5"
            >
              <Bot
                className={cn(
                  "size-4 shrink-0",
                  r.status === "error" ? "text-danger" : "text-subtle",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">
                  {label[r.status] ?? r.status}
                  {r.confidence !== null && r.status === "replied"
                    ? ` · ${Math.round(r.confidence * 100)}%`
                    : ""}
                </p>
                <p className="truncate text-[11px] text-subtle">{r.reason}</p>
              </div>
              <span className="shrink-0 text-[11px] text-subtle">
                {formatRelative(r.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
