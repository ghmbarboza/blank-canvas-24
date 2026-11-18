import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type CustomField = Tables<"custom_fields">;
export type FieldEntity = "contact" | "company" | "deal" | "ticket";
export type FieldType = CustomField["type"];

export const ENTITY_LABEL: Record<FieldEntity, string> = {
  contact: "Contatos",
  company: "Empresas",
  deal: "Negócios",
  ticket: "Chamados",
};

export const TYPE_LABEL: Record<string, string> = {
  text: "Texto curto",
  long_text: "Texto longo",
  number: "Número",
  money: "Valor (R$)",
  date: "Data",
  select: "Lista (uma opção)",
  multiselect: "Lista (várias opções)",
  boolean: "Sim ou não",
  url: "Link",
  email: "E-mail",
  phone: "Telefone",
};

export const fieldKeys = {
  all: (accountId: string) => ["custom-fields", accountId] as const,
};

export function useCustomFields(accountId: string) {
  return useQuery({
    queryKey: fieldKeys.all(accountId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_fields")
        .select("*")
        .eq("account_id", accountId)
        .order("entity")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function fieldsFor(
  list: CustomField[] | undefined,
  entity: FieldEntity,
  includeArchived = false,
) {
  return (list ?? []).filter((f) => f.entity === entity && (includeArchived || !f.archived));
}

// "Telefone comercial" → "telefone_comercial" (chave estável no JSON do registro).
export function slugKey(label: string): string {
  const s = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(s) ? s : `campo_${s}`.slice(0, 40);
}

export function optionList(f: CustomField): string[] {
  return Array.isArray(f.options)
    ? (f.options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];
}

export function useSaveField(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TablesInsert<"custom_fields">> & { id?: string }) => {
      const { id, ...values } = input;
      if (id) {
        const { error } = await supabase.from("custom_fields").update(values).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("custom_fields")
        .insert({ ...(values as TablesInsert<"custom_fields">), account_id: accountId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldKeys.all(accountId) }),
  });
}

export function useDeleteField(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldKeys.all(accountId) }),
  });
}

export function formatFieldValue(f: CustomField, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (f.type) {
    case "boolean":
      return v ? "Sim" : "Não";
    case "money":
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        Number(v),
      );
    case "date":
      return new Intl.DateTimeFormat("pt-BR").format(new Date(`${String(v)}T12:00:00`));
    case "multiselect":
      return Array.isArray(v) ? v.join(", ") : String(v);
    default:
      return String(v);
  }
}

// Campos obrigatórios que faltam (para validar antes de salvar ou de mover de etapa).
export function missingRequired(
  fields: CustomField[],
  values: Record<string, unknown>,
  stageId?: string | null,
) {
  return fields.filter((f) => {
    const need = f.required || (stageId && f.required_stage_id === stageId);
    if (!need) return false;
    const v = values[f.key];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}
