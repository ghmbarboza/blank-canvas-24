// Passo do assistente de configuração: equipe com habilidades e pelo menos uma fila ativa.
import { useSelfTest } from "./api";

export function useCallCenterSetupStatus(accountId: string): {
  done: boolean;
  summary: string;
  loading: boolean;
} {
  const t = useSelfTest(accountId);
  if (t.isLoading || !t.data)
    return { done: false, summary: "Conferindo a equipe e as filas…", loading: t.isLoading };
  const active = t.data.queues.length;
  const summary = !t.data.team
    ? "Ninguém na equipe de atendimento ainda"
    : !t.data.team_with_skills
      ? `${t.data.team} na equipe, nenhum com habilidade`
      : !active
        ? `${t.data.team} na equipe, nenhuma fila ativa`
        : t.data.ok
          ? `${t.data.team} na equipe e ${active} fila${active > 1 ? "s" : ""} pronta${active > 1 ? "s" : ""}`
          : "Nenhuma fila tem alguém com a habilidade exigida";
  return { done: t.data.ok, summary, loading: false };
}
