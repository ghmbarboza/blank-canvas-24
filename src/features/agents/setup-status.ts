// Passos do assistente de configuração (P13): "Monte sua equipe de IA" e "Conecte suas ferramentas".
import { useAgents, useComposioState } from "./api";

export type Status = { done: boolean; summary: string; loading: boolean };

export function useAgentsSetupStatus(accountId: string): Status {
  const agents = useAgents(accountId);
  const list = agents.data ?? [];
  // ativo já implica avaliação da versão atual com 90% ou mais (o banco não deixa ligar sem isso)
  const working = list.filter((a) => a.status === "active" && a.role !== "supervisor");
  const summary = agents.isPending
    ? "Carregando a equipe"
    : working.length
      ? `${working.length} agente${working.length > 1 ? "s" : ""} aprovado${working.length > 1 ? "s" : ""} e atendendo`
      : list.length
        ? `${list.length} agente${list.length > 1 ? "s" : ""} criado${list.length > 1 ? "s" : ""}, falta passar na avaliação e ligar`
        : "Nenhum agente criado";
  return { done: working.length > 0, summary, loading: agents.isPending };
}

export function useComposioSetupStatus(accountId: string): Status {
  const s = useComposioState(accountId);
  const active = (s.data?.connections ?? []).filter((c) => c.status === "active");
  const summary = s.isPending
    ? "Carregando"
    : !s.data?.hasKey
      ? "Chave da Composio não cadastrada (opcional)"
      : active.length
        ? `${active.length} app${active.length > 1 ? "s" : ""} conectado${active.length > 1 ? "s" : ""}: ${active.map((c) => c.toolkit).join(", ")}`
        : "Chave aceita, nenhum app conectado ainda";
  return { done: !!s.data?.hasKey && active.length > 0, summary, loading: s.isPending };
}
