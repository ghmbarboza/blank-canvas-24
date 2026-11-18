import { useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { voiceAgents } from "@/features/telephony/api";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { useDeleteAgent, useUpdateAgent, type Agent } from "./api";
import {
  AGENT_CHANNELS,
  agentChannelLabel,
  agentSettingsV2,
  agentStyle,
  entryConflict,
  type AgentSettingsV2,
  type AgentStyle,
  type FormField,
} from "./catalog";
import { ChannelIcon } from "@/components/brand/ChannelIcon";

const FORM_KEYS: FormField[] = [
  { key: "name", label: "nome", required: false },
  { key: "email", label: "e-mail", required: false },
  { key: "company", label: "empresa", required: false },
  { key: "job_title", label: "cargo", required: false },
  { key: "city", label: "cidade", required: false },
];

type Props = { accountId: string; agent: Agent; team: Agent[]; onDeleted: () => void };

// Configuração do agente em linguagem simples. Mudar o que ele diz pausa um agente ativo até passar de novo.
export function AgentConfigForm({ accountId, agent, team, onDeleted }: Props) {
  const { isManager } = useAccount();
  const update = useUpdateAgent(accountId);
  const remove = useDeleteAgent(accountId);
  const pages = useBookingPages(accountId);
  const voices = voiceAgents.useList(accountId);
  const [f, setF] = useState({
    name: agent.name,
    persona: agent.persona,
    tone: agent.tone,
    goal: agent.goal,
    instructions: agent.instructions,
    handoff_message: agent.handoff_message,
    channels: agent.channels ?? [],
    is_entry: agent.is_entry,
    voice_agent_id: agent.voice_agent_id,
    voice_id: agent.voice_id ?? "",
  });
  const [s, setS] = useState<AgentSettingsV2>(agentSettingsV2(agent.settings));
  const [st, setSt] = useState<AgentStyle>(agentStyle(agent.style));
  // um agente por canal: a porta de entrada só fica presa se outra disputa os mesmos canais
  const entryRival = team.find(
    (a) => a.is_entry && a.id !== agent.id && entryConflict(a.channels ?? [], f.channels),
  );
  const entryTaken = !!entryRival;
  const disabled = !isManager;

  function save() {
    if (!f.name.trim()) {
      toast.error("Dê um nome ao agente");
      return;
    }
    update.mutate(
      {
        id: agent.id,
        patch: {
          name: f.name.trim().slice(0, 60),
          persona: f.persona,
          tone: f.tone,
          goal: f.goal,
          instructions: f.instructions,
          handoff_message: f.handoff_message,
          channels: f.channels,
          is_entry: f.is_entry && !entryTaken,
          voice_agent_id: f.voice_agent_id,
          voice_id: f.voice_id.trim() || null,
          settings: s as never,
          style: st as never,
        },
      },
      {
        onSuccess: () =>
          toast.success(
            agent.status === "active"
              ? "Salvo. O agente pausou até passar na avaliação de novo."
              : "Salvo",
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  const toggleChannel = (id: string, on: boolean) =>
    setF({ ...f, channels: on ? [...f.channels, id] : f.channels.filter((c) => c !== id) });
  const toggleField = (ff: FormField, on: boolean) =>
    setS({
      ...s,
      form_fields: on ? [...s.form_fields, ff] : s.form_fields.filter((x) => x.key !== ff.key),
    });

  return (
    <form
      className="space-y-6 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Group title="Quem é">
        <Field label="Nome no time">
          <Input
            value={f.name}
            disabled={disabled}
            maxLength={60}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="Como se apresenta" hint="Ex.: consultora da Clínica Sol">
          <Input
            value={f.persona}
            disabled={disabled}
            maxLength={400}
            onChange={(e) => setF({ ...f, persona: e.target.value })}
          />
        </Field>
        <Field label="Jeito de falar">
          <Input
            value={f.tone}
            disabled={disabled}
            maxLength={300}
            onChange={(e) => setF({ ...f, tone: e.target.value })}
          />
        </Field>
        <Field label="Objetivo">
          <Textarea
            value={f.goal}
            disabled={disabled}
            rows={2}
            onChange={(e) => setF({ ...f, goal: e.target.value })}
          />
        </Field>
        <Field label="Regras da empresa" hint="Uma por linha. O que pode e o que não pode dizer.">
          <Textarea
            value={f.instructions}
            disabled={disabled}
            rows={6}
            onChange={(e) => setF({ ...f, instructions: e.target.value })}
          />
        </Field>
        <Field
          label="Política (limites)"
          hint="Desconto máximo, parcelas, prazos. A IA não passa disso."
        >
          <Textarea
            value={s.policy}
            disabled={disabled}
            rows={2}
            onChange={(e) => setS({ ...s, policy: e.target.value })}
          />
        </Field>
      </Group>

      <Group title="Onde atende e quando passa para a equipe">
        <div className="flex flex-wrap gap-3">
          {AGENT_CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={f.channels.includes(c.id)}
                disabled={disabled}
                onCheckedChange={(v) => toggleChannel(c.id, v === true)}
              />
              <span aria-hidden className="inline-flex">
                <ChannelIcon platform={c.id} size={16} />
              </span>
              {c.label}
            </label>
          ))}
        </div>
        <p className="text-[12px] text-subtle">
          Cada canal pode ter o seu agente. Nenhum marcado: atende os canais que não têm agente
          próprio.
        </p>
        <Toggle
          label={
            f.channels.length
              ? `Porta de entrada de ${f.channels.map(agentChannelLabel).join(", ")}`
              : "Porta de entrada dos outros canais"
          }
          hint={
            entryRival
              ? `${entryRival.name} já é a porta de entrada ${
                  f.channels.length ? "de um desses canais" : "dos outros canais"
                }.`
              : "Primeiro a falar com quem chega por esse canal."
          }
          checked={f.is_entry}
          disabled={disabled || entryTaken}
          onChange={(v) => setF({ ...f, is_entry: v })}
        />
        <Field label="Mensagem ao passar para a equipe">
          <Input
            value={f.handoff_message}
            disabled={disabled}
            maxLength={600}
            onChange={(e) => setF({ ...f, handoff_message: e.target.value })}
          />
        </Field>
        <Field label="Prazo da equipe para responder (minutos)">
          <Input
            type="number"
            min={1}
            max={1440}
            value={s.human_sla_minutes}
            disabled={disabled}
            onChange={(e) => setS({ ...s, human_sla_minutes: Number(e.target.value) || 15 })}
          />
        </Field>
        <Toggle
          label="Só no horário de atendimento"
          checked={s.business_hours_only}
          disabled={disabled}
          onChange={(v) => setS({ ...s, business_hours_only: v })}
        />
        <Field label="Página de agendamento" hint="Para ver horários e marcar reunião.">
          <Select
            value={s.booking_slug || "none"}
            disabled={disabled}
            onValueChange={(v) => setS({ ...s, booking_slug: v === "none" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem agenda</SelectItem>
              {(pages.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.slug}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Group>

      <Group title="Jeito de gente">
        <Toggle
          label="Mostrar digitando e esperar como gente"
          checked={st.typing}
          disabled={disabled}
          onChange={(v) => setSt({ ...st, typing: v })}
        />
        <Toggle
          label="Quebrar em mensagens curtas"
          checked={st.split}
          disabled={disabled}
          onChange={(v) => setSt({ ...st, split: v })}
        />
        <Toggle
          label="Espelhar o tom do cliente"
          hint="Formal com quem é formal, curto com quem é curto, sem emoji para quem não usa."
          checked={st.mirror_tone}
          disabled={disabled}
          onChange={(v) => setSt({ ...st, mirror_tone: v })}
        />
        <Field
          label='Resposta para "você é robô?"'
          hint="Vazio: diz com honestidade que é a assistente virtual e segue atendendo."
        >
          <Input
            value={st.robot_answer}
            disabled={disabled}
            maxLength={300}
            onChange={(e) => setSt({ ...st, robot_answer: e.target.value })}
          />
        </Field>
        <Field label="Responder áudio com áudio">
          <Select
            value={st.voice_reply}
            disabled={disabled}
            onValueChange={(v) => setSt({ ...st, voice_reply: v as AgentStyle["voice_reply"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mirror">Quando o cliente mandar áudio</SelectItem>
              <SelectItem value="always">Sempre em áudio</SelectItem>
              <SelectItem value="never">Nunca</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Voz da casa"
          hint="Ligado a um agente de voz, ele também passa a ter este jeito de falar, as regras e as ferramentas na próxima publicação em Ligações › Agentes de voz."
        >
          <Select
            value={f.voice_agent_id ?? "none"}
            disabled={disabled}
            onValueChange={(v) => setF({ ...f, voice_agent_id: v === "none" ? null : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolher pelo código</SelectItem>
              {(voices.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!f.voice_agent_id && (
            <Input
              className="mt-2"
              value={f.voice_id}
              placeholder="Código da voz (ElevenLabs)"
              disabled={disabled}
              onChange={(e) => setF({ ...f, voice_id: e.target.value })}
            />
          )}
        </Field>
      </Group>

      <Group title="Coletar na conversa e perguntar a satisfação">
        <p className="text-[12px] text-subtle">
          O que a IA descobre conversando e grava no cadastro, sem parecer formulário.
        </p>
        <div className="flex flex-wrap gap-3">
          {FORM_KEYS.map((ff) => (
            <label key={ff.key} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={s.form_fields.some((x) => x.key === ff.key)}
                disabled={disabled}
                onCheckedChange={(v) => toggleField(ff, v === true)}
              />
              {ff.label}
            </label>
          ))}
        </div>
        <Field
          label="Pesquisa no fim do atendimento"
          hint="Perguntada como conversa; a nota sai da resposta natural."
        >
          <Select
            value={s.survey}
            disabled={disabled}
            onValueChange={(v) => setS({ ...s, survey: v as AgentSettingsV2["survey"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Não perguntar</SelectItem>
              <SelectItem value="csat">Satisfação (1 a 5)</SelectItem>
              <SelectItem value="nps">Recomendação (0 a 10)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Group>

      {isManager && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-surface py-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-danger">
                <Trash2 /> Remover
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover {agent.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  O agente para de atender e a suíte de teste dele é apagada. O histórico das
                  conversas fica.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    remove.mutate(agent.id, {
                      onSuccess: () => {
                        toast.success("Agente removido");
                        onDeleted();
                      },
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      )}
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="eyebrow mb-2">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px]">{label}</Label>
      {children}
      {hint && <p className="text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="block text-[12px] text-subtle">{hint}</span>}
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
