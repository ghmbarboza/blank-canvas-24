import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Plus,
  Rocket,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { AGENT_TEMPLATES, TOOL_LABEL, templateFor, type VoicePurpose } from "./agent-templates";
import { phoneNumbers, telephonyApi, voiceAgents, type VoiceAgent } from "./api";

const PURPOSE_LABEL: Record<string, string> = {
  sac: "Atendimento",
  sdr: "SDR",
  confirmation: "Confirmação",
  collection: "Cobrança",
  custom: "Personalizado",
};
const MODELS = [
  { id: "eleven_v4_turbo", label: "Eleven v4 Turbo (ligação, recomendado)" },
  { id: "eleven_v4", label: "Eleven v4 (mais expressivo, mais lento)" },
  { id: "eleven_flash_v2_5", label: "Eleven Flash v2.5 (econômico)" },
];

// Agentes de voz com IA: modelos prontos, teste por texto sem gastar crédito e publicação conferida.
export function VoiceAgentsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const agents = voiceAgents.useList(accountId);
  const [editing, setEditing] = useState<VoiceAgent | null | "new">(null);
  const list = agents.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Agentes de voz"
        description="IA que atende e liga em português, com contexto do CRM, agenda e transferência para humano"
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ligacoes">
                <ArrowLeft /> Ligações
              </Link>
            </Button>
            {isManager && (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> Novo agente
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {agents.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-[24px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Crie o primeiro agente de voz"
            description="Comece por um modelo pronto: SDR que retorna para leads em menos de 1 minuto, atendimento, confirmação de reunião ou lembrete de pagamento."
            action={
              isManager && (
                <Button onClick={() => setEditing("new")}>
                  <Plus /> Novo agente
                </Button>
              )
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => {
              const St =
                a.status === "published"
                  ? CheckCircle2
                  : a.status === "error"
                    ? XCircle
                    : CircleDashed;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={!isManager}
                    onClick={() => setEditing(a)}
                    className="lift flex h-full w-full flex-col rounded-[24px] border border-border bg-surface p-5 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#0A1F3B] text-white">
                        <Bot className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{a.name}</span>
                        <span className="block text-[12px] text-subtle">
                          {PURPOSE_LABEL[a.purpose]} ·{" "}
                          {(
                            MODELS.find((m) => m.id === a.model_id)?.label ?? "Voz personalizada"
                          ).replace(/ \(.*\)$/, "")}
                        </span>
                      </span>
                      <St
                        className={cn(
                          "size-4",
                          a.status === "published"
                            ? "text-[#1F8A5B]"
                            : a.status === "error"
                              ? "text-[#B85C5C]"
                              : "text-subtle",
                        )}
                        aria-label={a.status}
                      />
                    </div>
                    <p className="mt-3 line-clamp-2 text-[12px] text-muted-foreground">
                      {a.objective || "Sem objetivo descrito."}
                    </p>
                    <p className="mt-auto pt-3 text-[11px] text-subtle">
                      {a.status === "published"
                        ? `Publicado ${formatRelative(a.synced_at)}`
                        : a.status === "error"
                          ? (a.last_sync_error ?? "Com erro")
                          : "Rascunho, ainda não publicado"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <AgentEditor accountId={accountId} agent={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

interface Form {
  name: string;
  purpose: VoicePurpose;
  objective: string;
  first_message: string;
  prompt: string;
  knowledge: string;
  voice_id: string;
  model_id: string;
  tools: string[];
  transfer_number: string;
  phone_number_id: string | null;
}

function fromAgent(a: VoiceAgent): Form {
  return {
    name: a.name,
    purpose: a.purpose as VoicePurpose,
    objective: a.objective ?? "",
    first_message: a.first_message ?? "",
    prompt: a.prompt,
    knowledge: a.knowledge ?? "",
    voice_id: a.voice_id ?? "",
    model_id: a.model_id,
    tools: a.tools,
    transfer_number: a.transfer_number ?? "",
    phone_number_id: a.phone_number_id,
  };
}

function fromTemplate(p: VoicePurpose): Form {
  const t = templateFor(p);
  return {
    name: t.purpose === "custom" ? "" : t.label.split(":")[0]!,
    purpose: p,
    objective: t.objective,
    first_message: t.firstMessage,
    prompt: t.prompt,
    knowledge: "",
    voice_id: "",
    model_id: "eleven_v4_turbo",
    tools: t.tools,
    transfer_number: "",
    phone_number_id: null,
  };
}

function AgentEditor({
  accountId,
  agent,
  onClose,
}: {
  accountId: string;
  agent: VoiceAgent | null | "new";
  onClose: () => void;
}) {
  const save = voiceAgents.useSave(accountId);
  const remove = voiceAgents.useRemove(accountId);
  const numbers = phoneNumbers.useList(accountId);
  const [form, setForm] = useState<Form>(fromTemplate("sdr"));
  const [id, setId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [diff, setDiff] = useState<{ field: string; expected: string; actual: string }[]>([]);
  const voices = useQuery({
    queryKey: ["el-voices", accountId],
    enabled: agent !== null,
    retry: false,
    staleTime: 600_000,
    queryFn: () => telephonyApi.voices(accountId).then((r) => r.voices),
  });

  useEffect(() => {
    if (agent === null) return;
    setDiff([]);
    if (agent === "new") {
      setForm(fromTemplate("sdr"));
      setId(null);
    } else {
      setForm(fromAgent(agent));
      setId(agent.id);
      setDiff(
        (agent.sync_diff as unknown as { field: string; expected: string; actual: string }[]) ?? [],
      );
    }
  }, [agent]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function persist(): Promise<string | null> {
    if (!form.name.trim()) {
      toast.error("Dê um nome ao agente");
      return null;
    }
    const row = await save.mutateAsync({
      ...(id ? { id } : {}),
      values: {
        name: form.name.trim(),
        purpose: form.purpose,
        objective: form.objective || null,
        first_message: form.first_message || null,
        prompt: form.prompt,
        knowledge: form.knowledge || null,
        voice_id: form.voice_id || null,
        model_id: form.model_id,
        tools: form.tools,
        transfer_number: form.transfer_number || null,
        phone_number_id: form.phone_number_id,
        status: "draft",
      },
    });
    setId(row.id);
    return row.id;
  }

  async function publish() {
    setPublishing(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const r = await telephonyApi.publishAgent(accountId, saved);
      setDiff(r.diff);
      if (r.diff.length) toast.error("A ElevenLabs não gravou tudo. Veja os campos abaixo.");
      else toast.success("Agente publicado e conferido campo a campo");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Sheet open={agent !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{id ? form.name || "Agente de voz" : "Novo agente de voz"}</SheetTitle>
          <SheetDescription>
            Variáveis disponíveis no texto:{" "}
            {
              "{{lead_name}}, {{agent_name}}, {{company_name}}, {{crm_context}}, {{upcoming_meeting_human}}"
            }
            .
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {!id && (
              <div className="grid gap-2 sm:grid-cols-2">
                {AGENT_TEMPLATES.map((t) => (
                  <button
                    key={t.purpose}
                    type="button"
                    onClick={() => setForm(fromTemplate(t.purpose))}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-colors",
                      form.purpose === t.purpose
                        ? "border-primary bg-primary-soft/40"
                        : "border-border hover:bg-surface-2",
                    )}
                  >
                    <p className="text-[13px] font-semibold">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground">{t.description}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do agente (como ele se apresenta)">
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ex.: Ana"
                />
              </Field>
              <Field label="Modelo de voz">
                <Select value={form.model_id} onValueChange={(v) => set("model_id", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Voz">
                {voices.data && voices.data.length > 0 ? (
                  <Select
                    {...(form.voice_id ? { value: form.voice_id } : {})}
                    onValueChange={(v) => set("voice_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a voz" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.data.map((v) => (
                        <SelectItem key={v.voice_id} value={v.voice_id}>
                          {v.name}
                          {v.accent ? ` · ${v.accent}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.voice_id}
                    onChange={(e) => set("voice_id", e.target.value)}
                    placeholder={
                      voices.isError ? "Conecte a ElevenLabs; ou cole o voice_id" : "voice_id"
                    }
                  />
                )}
              </Field>
              <Field label="Número que ele usa">
                <Select
                  value={form.phone_number_id ?? "none"}
                  onValueChange={(v) => set("phone_number_id", v === "none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(numbers.data ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.label ? `${n.label} · ` : ""}
                        {n.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Objetivo">
              <Input value={form.objective} onChange={(e) => set("objective", e.target.value)} />
            </Field>
            <Field label="Primeira fala (inclua o aviso de gravação)">
              <Textarea
                rows={2}
                value={form.first_message}
                onChange={(e) => set("first_message", e.target.value)}
              />
            </Field>
            <Field label="Instruções do agente">
              <Textarea
                rows={10}
                value={form.prompt}
                onChange={(e) => set("prompt", e.target.value)}
                className="font-mono text-[12px]"
              />
            </Field>
            <Field label="Base de conhecimento (horários, preços, políticas: só o que ele pode afirmar)">
              <Textarea
                rows={5}
                value={form.knowledge}
                onChange={(e) => set("knowledge", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Ferramentas</Label>
                {Object.entries(TOOL_LABEL).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-[13px]">
                    <Checkbox
                      checked={form.tools.includes(k)}
                      onCheckedChange={(c) =>
                        set("tools", c ? [...form.tools, k] : form.tools.filter((t) => t !== k))
                      }
                    />
                    {l}
                  </label>
                ))}
              </div>
              <Field label="Transferir para humano (telefone ou ramal externo)">
                <Input
                  value={form.transfer_number}
                  onChange={(e) => set("transfer_number", e.target.value)}
                  placeholder="+5548..."
                  inputMode="tel"
                />
              </Field>
            </div>
            {diff.length > 0 && (
              <div className="rounded-2xl border border-[#B85C5C]/40 bg-[#B85C5C]/5 p-3 text-[12px]">
                <p className="mb-1 font-semibold text-[#B85C5C]">
                  A ElevenLabs aceitou mas não gravou:
                </p>
                <ul className="space-y-0.5">
                  {diff.map((d) => (
                    <li key={d.field}>
                      <span className="font-medium">{d.field}</span>: esperado “{d.expected}”, ficou
                      “{d.actual}”
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() =>
                  void persist()
                    .then((x) => x && toast.success("Rascunho salvo"))
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                Salvar rascunho
              </Button>
              <Button disabled={publishing} onClick={() => void publish()}>
                {publishing ? <Loader2 className="animate-spin" /> : <Rocket />} Publicar na
                ElevenLabs
              </Button>
              {id && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    remove.mutate(id, {
                      onSuccess: () => {
                        toast.success("Agente excluído");
                        onClose();
                      },
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Trash2 /> Excluir
                </Button>
              )}
            </div>
          </div>
          <TestChat
            accountId={accountId}
            agentId={id}
            firstMessage={form.first_message}
            onEnsureSaved={persist}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Teste por texto: a IA da conta faz o papel do agente com o mesmo prompt. Não gasta crédito de voz.
function TestChat({
  accountId,
  agentId,
  firstMessage,
  onEnsureSaved,
}: {
  accountId: string;
  agentId: string | null;
  firstMessage: string;
  onEnsureSaved: () => Promise<string | null>;
}) {
  const [msgs, setMsgs] = useState<
    { role: "user" | "assistant"; content: string; tool?: string | null }[]
  >([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const id = agentId ?? (await onEnsureSaved());
      if (!id) return;
      const history = [
        ...(msgs.length ? msgs : [{ role: "assistant" as const, content: firstMessage }]),
        { role: "user" as const, content: text.trim() },
      ];
      setMsgs(history);
      setText("");
      const r = await telephonyApi.testAgent(
        accountId,
        id,
        history.map(({ role, content }) => ({ role, content })),
      );
      setMsgs([...history, { role: "assistant", content: r.reply, tool: r.tool }]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-[560px] flex-col rounded-[24px] border border-border bg-surface-2/40">
      <p className="eyebrow border-b border-border px-4 py-3">Testar por texto</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-[13px]">
        <p className="rounded-2xl bg-surface px-3 py-2">
          {firstMessage || "Escreva a primeira fala para ver aqui."}
        </p>
        {msgs.slice(msgs[0]?.content === firstMessage ? 1 : 0).map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] rounded-2xl px-3 py-2",
              m.role === "user" ? "ml-auto bg-[#0A1F3B] text-white" : "bg-surface",
            )}
          >
            {m.content}
            {m.tool && (
              <p className="mt-1 text-[10px] text-subtle">usaria: {TOOL_LABEL[m.tool] ?? m.tool}</p>
            )}
          </div>
        ))}
        {busy && <Loader2 className="size-4 animate-spin text-subtle" />}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Fale como o cliente"
          aria-label="Mensagem de teste"
        />
        <Button type="submit" size="icon" disabled={busy} aria-label="Enviar">
          <Send />
        </Button>
      </form>
    </aside>
  );
}
