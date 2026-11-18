// Configuração dos nós "Chamar agente de IA" e "Ação num app conectado" no editor de automação.
import { Link } from "@tanstack/react-router";

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
import { useAgents, useComposioState } from "@/features/agents/api";
import { COMPOSIO_TOOLKITS, roleDef } from "@/features/agents/catalog";

type Props = {
  accountId: string;
  config: Record<string, unknown>;
  readOnly: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
};

const str = (c: Record<string, unknown>, k: string) =>
  typeof c[k] === "string" ? (c[k] as string) : "";

export function AiAgentNodePanel({ accountId, config: c, readOnly, onPatch }: Props) {
  const agents = useAgents(accountId);
  const list = (agents.data ?? []).filter((a) => a.role !== "supervisor");
  return (
    <>
      <div className="grid gap-1.5">
        <Label>Agente</Label>
        <Select
          value={str(c, "agent_id")}
          onValueChange={(v) =>
            onPatch({ agent_id: v, agent_name: list.find((a) => a.id === v)?.name ?? "" })
          }
          disabled={readOnly}
        >
          <SelectTrigger aria-label="Agente">
            <SelectValue placeholder={list.length ? "Escolha o agente" : "Nenhum agente criado"} />
          </SelectTrigger>
          <SelectContent>
            {list.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {roleDef(a.role).label}
                {a.status !== "active" ? " (desligado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!list.length && (
          <p className="text-[12px] text-subtle">
            Crie um agente em{" "}
            <Link to="/equipe-ia" className="underline">
              Equipe de IA
            </Link>
            .
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="np-goal">Objetivo para o agente</Label>
        <Textarea
          id="np-goal"
          rows={3}
          value={str(c, "goal")}
          placeholder="Ex.: retomar a proposta enviada e oferecer um horário para conversar"
          onChange={(e) => onPatch({ goal: e.target.value })}
          disabled={readOnly}
        />
      </div>
      <label className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
        <span>
          Começar a conversa
          <span className="block text-[12px] text-subtle">
            O agente escreve a primeira mensagem. No WhatsApp oficial, só dentro da janela de 24 h.
          </span>
        </span>
        <Switch
          checked={c["start_conversation"] === true}
          onCheckedChange={(v) => onPatch({ start_conversation: v })}
          disabled={readOnly}
        />
      </label>
      <p className="text-[12px] text-subtle">
        Desligado, o agente assume a conversa e responde quando o cliente escrever. Se uma pessoa da
        equipe já estiver na conversa, o passo é pulado.
      </p>
    </>
  );
}

export function ComposioNodePanel({ accountId, config: c, readOnly, onPatch }: Props) {
  const state = useComposioState(accountId);
  const active = (state.data?.connections ?? [])
    .filter((x) => x.status === "active")
    .map((x) => x.toolkit);
  const toolkits = COMPOSIO_TOOLKITS.filter((t) => active.includes(t.slug));
  const tk = toolkits.find((t) => t.slug === str(c, "toolkit"));
  return (
    <>
      {!toolkits.length && (
        <p className="rounded-xl border border-dashed border-border p-3 text-[12px] text-muted-foreground">
          Nenhum app conectado. Conecte em{" "}
          <Link to="/equipe-ia/ferramentas" className="underline">
            Ferramentas conectadas
          </Link>
          .
        </p>
      )}
      <div className="grid gap-1.5">
        <Label>App</Label>
        <Select
          value={str(c, "toolkit")}
          onValueChange={(v) => onPatch({ toolkit: v, tool_slug: "", tool_label: "" })}
          disabled={readOnly || !toolkits.length}
        >
          <SelectTrigger aria-label="App">
            <SelectValue placeholder="Escolha o app" />
          </SelectTrigger>
          <SelectContent>
            {toolkits.map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label>Ação</Label>
        <Select
          value={str(c, "tool_slug")}
          onValueChange={(v) =>
            onPatch({
              tool_slug: v,
              tool_label: tk?.suggested.find((s) => s.slug === v)?.label ?? v,
            })
          }
          disabled={readOnly || !tk}
        >
          <SelectTrigger aria-label="Ação">
            <SelectValue placeholder="Escolha a ação" />
          </SelectTrigger>
          <SelectContent>
            {(tk?.suggested ?? []).map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="np-args">Campos da ação (JSON)</Label>
        <Textarea
          id="np-args"
          rows={5}
          className="font-mono text-[12px]"
          value={
            typeof c["arguments"] === "string"
              ? (c["arguments"] as string)
              : JSON.stringify(c["arguments"] ?? {}, null, 2)
          }
          placeholder={'{\n  "channel": "#vendas",\n  "text": "{{nome}} pediu proposta"\n}'}
          onChange={(e) => onPatch({ arguments: e.target.value })}
          disabled={readOnly}
        />
        <p className="text-[12px] text-subtle">
          Use as variáveis {"{{nome}} {{primeiro_nome}} {{empresa}} {{vendedor}}"}. Cada execução
          fica registrada.
        </p>
      </div>
    </>
  );
}
