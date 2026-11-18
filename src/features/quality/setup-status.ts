import { useQualityForms } from "./api";

/** Pronto quando há ao menos um formulário de qualidade ativo. */
export function useQualitySetupStatus(accountId: string): {
  done: boolean;
  summary: string;
  loading: boolean;
} {
  const forms = useQualityForms(accountId);
  const active = (forms.data ?? []).filter((f) => f.is_active);
  return {
    loading: forms.isPending,
    done: active.length > 0,
    summary:
      active.length > 0
        ? `${active.length} formulário${active.length > 1 ? "s" : ""} ativo${active.length > 1 ? "s" : ""}: ${active.map((f) => f.name).join(", ")}`
        : "Nenhum formulário de qualidade ativo",
  };
}
