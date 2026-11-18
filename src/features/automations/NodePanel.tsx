import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

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
import { useTeamMembers } from "@/features/contacts/api";
import { fieldsFor, useCustomFields } from "@/features/custom-fields/api";
import { supabase } from "@/integrations/supabase/client";

import { AiAgentNodePanel, ComposioNodePanel } from "./AiNodePanels";
import { NODE_LABEL, type AutoNode } from "./engine";
import { NODE_ICON } from "./nodeMeta";
import { hasChannel } from "@/lib/edition";
import { cn } from "@/lib/utils";

interface Props {
  accountId: string;
  node: AutoNode;
  isStart: boolean;
  readOnly: boolean;
  onChange: (n: AutoNode) => void;
  onDelete: () => void;
  onMakeStart: () => void;
}

const VARS = "{{nome}} {{primeiro_nome}} {{empresa}} {{vendedor}} {{cidade}}";

// Propriedades do passo selecionado no editor.
export function NodePanel({
  accountId,
  node,
  isStart,
  readOnly,
  onChange,
  onDelete,
  onMakeStart,
}: Props) {
  const c = node.config ?? {};
  const set = (k: string, v: unknown) => onChange({ ...node, config: { ...c, [k]: v } });
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  const Icon = NODE_ICON[node.type];
  const team = useTeamMembers(accountId);
  const fields = useCustomFields(accountId);
  const stages = useQuery({
    queryKey: ["auto-stages", accountId],
    enabled: node.type === "move_stage",
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("id, name, pipelines(name)")
        .eq("account_id", accountId)
        .order("position");
      return data ?? [];
    },
  });

  const text = (k: string, label: string, placeholder?: string, rows?: number) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`np-${k}`}>{label}</Label>
      {rows ? (
        <Textarea
          id={`np-${k}`}
          rows={rows}
          value={s(k)}
          placeholder={placeholder}
          onChange={(e) => set(k, e.target.value)}
          disabled={readOnly}
        />
      ) : (
        <Input
          id={`np-${k}`}
          value={s(k)}
          placeholder={placeholder}
          onChange={(e) => set(k, e.target.value)}
          disabled={readOnly}
        />
      )}
    </div>
  );
  const select = (
    k: string,
    label: string,
    opts: { value: string; label: string }[],
    fallback?: string,
  ) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select
        value={s(k) || fallback || opts[0]?.value || ""}
        onValueChange={(v) => set(k, v)}
        disabled={readOnly}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const minutes = (k: string, label: string, fallback: number) => {
    const total = Number(c[k] ?? fallback);
    const unit = total % 1440 === 0 ? 1440 : total % 60 === 0 ? 60 : 1;
    return (
      <div className="grid gap-1.5">
        <Label>{label}</Label>
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            className="w-24"
            value={String(total / unit)}
            disabled={readOnly}
            onChange={(e) =>
              set(k, Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)) * unit)
            }
            aria-label="Quantidade"
          />
          <Select
            value={String(unit)}
            onValueChange={(u) => set(k, Math.max(1, Math.round(total / unit)) * Number(u))}
            disabled={readOnly}
          >
            <SelectTrigger className="w-32" aria-label="Unidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">minutos</SelectItem>
              <SelectItem value="60">horas</SelectItem>
              <SelectItem value="1440">dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };
  const ownerSelect = (
    <div className="grid gap-1.5">
      <Label>Para quem</Label>
      <Select
        value={s("user_id") || "__owner"}
        onValueChange={(v) => set("user_id", v === "__owner" ? "" : v)}
        disabled={readOnly}
      >
        <SelectTrigger aria-label="Para quem">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__owner">Responsável pelo contato</SelectItem>
          {(team.data ?? []).map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const category = select("category", "Tipo de mensagem", [
    { value: "marketing", label: "Marketing (respeita consentimento e descadastro)" },
    { value: "transactional", label: "Transacional (confirmações, avisos do serviço)" },
  ]);

  let body: React.ReactNode = null;
  switch (node.type) {
    case "email":
      body = (
        <>
          {text("subject", "Assunto", "Ex.: {{primeiro_nome}}, separei isto para você")}
          {text("body", "Texto", "Escreva como numa conversa. Use as variáveis abaixo.", 8)}
          {category}
        </>
      );
      break;
    case "whatsapp":
      body = (
        <>
          {text(
            "text",
            hasChannel("whatsapp_official") ? "Mensagem (dentro da janela de 24 h)" : "Mensagem",
            "Oi {{primeiro_nome}}…",
            5,
          )}
          <div
            className={cn(
              "rounded-xl border border-border bg-surface-2/50 p-3",
              // modelo aprovado só existe no número oficial da Meta
              !hasChannel("whatsapp_official") && "hidden",
            )}
          >
            <p className="mb-2 text-[12px] text-muted-foreground">
              Fora da janela de 24 h o WhatsApp oficial só aceita template aprovado pela Meta.
            </p>
            {text("template_name", "Nome do template (opcional)", "ex.: retomada_contato")}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {text("template_language", "Idioma", "pt_BR")}
              <div className="grid gap-1.5">
                <Label htmlFor="np-params">Variáveis do template</Label>
                <Input
                  id="np-params"
                  disabled={readOnly}
                  value={
                    Array.isArray(c["template_params"])
                      ? (c["template_params"] as string[]).join(", ")
                      : ""
                  }
                  placeholder="{{primeiro_nome}}, {{vendedor}}"
                  onChange={(e) =>
                    set(
                      "template_params",
                      e.target.value
                        .split(",")
                        .map((p) => p.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </div>
            </div>
          </div>
          {select("category", "Tipo de mensagem", [
            { value: "marketing", label: "Marketing (exige consentimento)" },
            { value: "service", label: "Atendimento" },
            { value: "utility", label: "Utilidade (confirmações)" },
          ])}
        </>
      );
      break;
    case "sms":
      body = text("text", "Texto do SMS (até 160 caracteres)", "", 3);
      break;
    case "voice_call":
      body = (
        <>
          {text("voice_agent_id", "Agente de voz", "id do agente (em Ligações › Agentes de voz)")}
          {text("goal", "Objetivo da ligação", "Ex.: confirmar interesse e marcar reunião", 3)}
        </>
      );
      break;
    case "task":
      body = (
        <>
          {text("title", "Título da tarefa", "Ex.: Conferir o pedido de {{nome}}")}
          {select("type", "Tipo", [
            ...(hasChannel("phone") ? [{ value: "call", label: "Ligar" }] : []),
            { value: "task", label: "Tarefa" },
            { value: "whatsapp", label: "WhatsApp" },
            ...(hasChannel("email") ? [{ value: "email", label: "E-mail" }] : []),
            { value: "meeting", label: "Reunião" },
          ])}
          {minutes("due_in_minutes", "Prazo a partir de agora", 60)}
          {ownerSelect}
        </>
      );
      break;
    case "ticket":
      body = (
        <>
          {text("subject", "Assunto do chamado", "Ex.: Nota baixa de {{nome}}")}
          {text("description", "O que a equipe precisa saber", "Ex.: Ligar e entender o motivo", 3)}
          {select("priority", "Prioridade", [
            { value: "normal", label: "Normal" },
            { value: "high", label: "Alta" },
            { value: "urgent", label: "Urgente" },
          ])}
        </>
      );
      break;
    case "move_stage":
      body = (
        <div className="grid gap-1.5">
          <Label>Etapa de destino</Label>
          <Select
            {...(s("stage_id") ? { value: s("stage_id") } : {})}
            onValueChange={(v) => {
              const st = (stages.data ?? []).find((x) => x.id === v);
              onChange({
                ...node,
                config: {
                  ...c,
                  stage_id: v,
                  stage_name: st
                    ? `${(st.pipelines as unknown as { name: string } | null)?.name ?? ""} · ${st.name}`
                    : "",
                },
              });
            }}
            disabled={readOnly}
          >
            <SelectTrigger aria-label="Etapa">
              <SelectValue placeholder="Escolha a etapa" />
            </SelectTrigger>
            <SelectContent>
              {(stages.data ?? []).map((st) => (
                <SelectItem key={st.id} value={st.id}>
                  {(st.pipelines as unknown as { name: string } | null)?.name} · {st.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-subtle">
            Move o cartão que iniciou a automação, ou o cartão aberto mais recente do cliente na
            carteira.
          </p>
        </div>
      );
      break;
    case "assign": {
      const users = Array.isArray(c["users"]) ? (c["users"] as string[]) : [];
      body = (
        <div className="grid gap-2">
          <Label>Rodízio entre</Label>
          {(team.data ?? []).map((m) => (
            <label key={m.userId} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                disabled={readOnly}
                checked={users.includes(m.userId)}
                onCheckedChange={(v) =>
                  set("users", v ? [...users, m.userId] : users.filter((u) => u !== m.userId))
                }
              />
              {m.name}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "add_tag":
    case "remove_tag":
      body = text("tag", "Etiqueta", "ex.: cliente-vip");
      break;
    case "set_field":
      body = (
        <>
          {select("field", "Campo", [
            { value: "lifecycle", label: "Fase" },
            { value: "temperature", label: "Temperatura" },
            { value: "source", label: "Origem" },
            { value: "city", label: "Cidade" },
            ...fieldsFor(fields.data, "contact").map((f) => ({
              value: `custom.${f.key}`,
              label: f.label,
            })),
          ])}
          {text("value", "Valor")}
        </>
      );
      break;
    case "ai_agent":
    case "composio_action": {
      const P = node.type === "ai_agent" ? AiAgentNodePanel : ComposioNodePanel;
      body = (
        <P
          accountId={accountId}
          config={c}
          readOnly={readOnly}
          onPatch={(patch) => onChange({ ...node, config: { ...c, ...patch } })}
        />
      );
      break;
    }
    case "ai_toggle":
      body = (
        <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[13px]">
          Ligar a IA nas conversas do contato
          <Switch
            checked={Boolean(c["enabled"])}
            onCheckedChange={(v) => set("enabled", v)}
            disabled={readOnly}
          />
        </label>
      );
      break;
    case "wait":
      body = minutes("minutes", "Esperar", 1440);
      break;
    case "wait_event":
      body = (
        <>
          {select("event", "Esperar até o contato", [
            { value: "replied", label: "Responder" },
            ...(hasChannel("email")
              ? [
                  { value: "opened", label: "Abrir o e-mail" },
                  { value: "clicked", label: "Clicar no e-mail" },
                ]
              : []),
            { value: "meeting", label: "Marcar uma reunião" },
          ])}
          {minutes("timeout_minutes", "Prazo máximo", 1440)}
        </>
      );
      break;
    case "condition":
      body = (
        <>
          {select("kind", "Se o contato", [
            { value: "replied", label: "Respondeu" },
            ...(hasChannel("email")
              ? [
                  { value: "opened", label: "Abriu um e-mail" },
                  { value: "clicked", label: "Clicou num e-mail" },
                ]
              : []),
            { value: "meeting", label: "Marcou reunião" },
            { value: "score_gte", label: "Tem score maior ou igual a" },
            { value: "lifecycle_eq", label: "Está na fase" },
            { value: "temperature_eq", label: "Tem temperatura" },
            { value: "has_tag", label: "Tem a etiqueta" },
            { value: "field_eq", label: "Tem o campo personalizado igual a" },
          ])}
          {["score_gte", "lifecycle_eq", "temperature_eq", "has_tag", "field_eq"].includes(
            s("kind"),
          ) && (
            <>
              {s("kind") === "field_eq" &&
                select(
                  "key",
                  "Campo",
                  fieldsFor(fields.data, "contact").map((f) => ({ value: f.key, label: f.label })),
                )}
              {s("kind") === "lifecycle_eq"
                ? select("value", "Fase", [
                    { value: "lead", label: "Contato" },
                    { value: "opportunity", label: "Em negociação" },
                    { value: "customer", label: "Cliente" },
                    { value: "inactive", label: "Inativo" },
                  ])
                : s("kind") === "temperature_eq"
                  ? select("value", "Temperatura", [
                      { value: "hot", label: "Interesse alto" },
                      { value: "warm", label: "Interesse médio" },
                      { value: "cold", label: "Interesse baixo" },
                    ])
                  : text("value", "Valor")}
            </>
          )}
        </>
      );
      break;
    case "ab_split":
      body = (
        <div className="grid gap-1.5">
          <Label htmlFor="np-ab">Percentual no grupo A</Label>
          <Input
            id="np-ab"
            inputMode="numeric"
            value={String(c["percent_a"] ?? 50)}
            disabled={readOnly}
            onChange={(e) =>
              set(
                "percent_a",
                Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, "") || 0))),
              )
            }
          />
        </div>
      );
      break;
    case "webhook":
      body = text("url", "URL (https)", "https://seu-sistema.com/gatilho");
      break;
    case "notify":
      body = (
        <>
          {text("title", "Aviso", "Ex.: {{nome}} respondeu a pesquisa")}
          {text("body", "Detalhe (opcional)", "", 3)}
          {ownerSelect}
        </>
      );
      break;
    default:
      body = (
        <p className="text-[13px] text-muted-foreground">
          A automação termina aqui para o contato.
        </p>
      );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid size-8 place-items-center rounded-xl bg-[#0A1F3B] text-white">
          <Icon className="size-4" />
        </span>
        <p className="flex-1 text-[14px] font-semibold">{NODE_LABEL[node.type]}</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {body}
        {["email", "whatsapp", "sms", "task", "notify"].includes(node.type) && (
          <p className="rounded-xl bg-surface-2 p-3 font-mono text-[11px] text-muted-foreground">
            Variáveis: {VARS}
          </p>
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-2 border-t border-border p-3">
          {!isStart && (
            <Button size="sm" variant="outline" onClick={onMakeStart}>
              Tornar 1º passo
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-danger hover:text-danger"
            onClick={onDelete}
          >
            <Trash2 /> Remover passo
          </Button>
        </div>
      )}
    </div>
  );
}
