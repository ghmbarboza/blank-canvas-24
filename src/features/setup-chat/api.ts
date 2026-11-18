import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { callApi } from "@/lib/api";
import { ACCOUNT_QUERY_KEY } from "@/lib/account";
import type { StoredPart } from "@/backend/setup-agent/stage";

export interface SetupAction {
  kind: "link" | "open" | "done" | "error";
  label: string;
  url?: string;
  to?: string;
  tool: string;
}

export interface SetupMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: SetupAction[];
  created_at: string;
  /** o que a resposta desenhou no palco do modal (texto, blocos, ações) */
  parts?: StoredPart[];
  pending?: boolean;
}

export interface SetupFact {
  id: string;
  key: string;
  category: string;
  label: string;
  value: string;
  source: string;
  updated_at: string;
}

export interface KbDocument {
  id: string;
  name: string;
  source: "upload" | "site" | "google_drive" | "onedrive" | "texto";
  source_ref: string | null;
  status: "processing" | "ready" | "error";
  error: string | null;
  chunks: number;
  size_bytes: number | null;
  storage_path: string | null;
  created_at: string;
}

export interface ProductWish {
  id: string;
  title: string;
  description: string;
  importance: "baixa" | "media" | "alta";
  status: "novo" | "em_analise" | "planejado" | "feito" | "descartado";
  created_at: string;
}

export const setupKeys = {
  messages: (a: string) => ["setup-chat", a, "messages"] as const,
  facts: (a: string) => ["setup-chat", a, "facts"] as const,
  docs: (a: string) => ["setup-chat", a, "docs"] as const,
  wishes: (a: string) => ["setup-chat", a, "wishes"] as const,
};

export function useSetupMessages(accountId: string) {
  return useQuery({
    queryKey: setupKeys.messages(accountId),
    queryFn: async (): Promise<SetupMessage[]> => {
      const { data, error } = await supabase
        .from("setup_messages")
        .select("id, role, content, actions, parts, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as SetupMessage[];
    },
  });
}

/** Depois de uma rodada da Nexa: tudo o que ela pode ter mudado na central volta a ser lido. */
export function refreshAfterTurn(qc: QueryClient, accountId: string) {
  for (const key of [
    setupKeys.messages(accountId),
    setupKeys.facts(accountId),
    setupKeys.docs(accountId),
    setupKeys.wishes(accountId),
    ACCOUNT_QUERY_KEY,
    ["integrations", accountId],
    ["channels", accountId],
    ["setup"],
  ])
    void qc.invalidateQueries({ queryKey: key as readonly unknown[] });
}

export function useSendSetup(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      callApi<{ message: SetupMessage; used: string[] }>("/api/setup-chat", {
        accountId,
        action: "send",
        text,
      }),
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: setupKeys.messages(accountId) });
      const temp: SetupMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: text,
        actions: [],
        created_at: new Date().toISOString(),
        pending: true,
      };
      qc.setQueryData<SetupMessage[]>(setupKeys.messages(accountId), (old) => [
        ...(old ?? []),
        temp,
      ]);
    },
    onSettled: (r) => {
      void qc.invalidateQueries({ queryKey: setupKeys.messages(accountId) });
      if (!r?.used.length) return;
      // a IA mexeu na central: atualiza o que ela pode ter mudado
      void qc.invalidateQueries({ queryKey: setupKeys.facts(accountId) });
      void qc.invalidateQueries({ queryKey: setupKeys.docs(accountId) });
      void qc.invalidateQueries({ queryKey: setupKeys.wishes(accountId) });
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["integrations", accountId] });
      void qc.invalidateQueries({ queryKey: ["channels", accountId] });
      void qc.invalidateQueries({ queryKey: ["setup"] });
    },
  });
}

export function useSetupFacts(accountId: string) {
  return useQuery({
    queryKey: setupKeys.facts(accountId),
    queryFn: async (): Promise<SetupFact[]> => {
      const { data, error } = await supabase
        .from("setup_facts")
        .select("id, key, category, label, value, source, updated_at")
        .eq("account_id", accountId)
        .order("category")
        .order("updated_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveFact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { id: string; label: string; value: string }) => {
      const { error } = await supabase
        .from("setup_facts")
        .update({
          label: f.label,
          value: f.value,
          source: "pessoa",
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", f.id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: setupKeys.facts(accountId) }),
  });
}

export function useDeleteFact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("setup_facts")
        .delete()
        .eq("account_id", accountId)
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: setupKeys.facts(accountId) }),
  });
}

export function useDocuments(accountId: string) {
  return useQuery({
    queryKey: setupKeys.docs(accountId),
    queryFn: async (): Promise<KbDocument[]> => {
      const { data, error } = await supabase
        .from("kb_documents")
        .select(
          "id, name, source, source_ref, status, error, chunks, size_bytes, storage_path, created_at",
        )
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as KbDocument[];
    },
    // enquanto algum arquivo está sendo lido, confere de novo
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "processing") ? 3000 : false),
  });
}

const safeName = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .slice(-120);

export function useUploadDocuments(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const results: { name: string; ok: boolean; error?: string }[] = [];
      for (const file of files) {
        const path = `${accountId}/${crypto.randomUUID()}-${safeName(file.name)}`;
        try {
          const up = await supabase.storage
            .from("kb-docs")
            .upload(path, file, { contentType: file.type || "application/octet-stream" });
          if (up.error) throw up.error;
          await callApi("/api/setup-chat", {
            accountId,
            action: "index",
            path,
            name: file.name,
            mime: file.type || null,
          });
          results.push({ name: file.name, ok: true });
        } catch (err) {
          results.push({
            name: file.name,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          void qc.invalidateQueries({ queryKey: setupKeys.docs(accountId) });
        }
      }
      return results;
    },
  });
}

export function useDeleteDocument(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: KbDocument) => {
      if (d.storage_path) await supabase.storage.from("kb-docs").remove([d.storage_path]);
      const { error } = await supabase
        .from("kb_documents")
        .delete()
        .eq("account_id", accountId)
        .eq("id", d.id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: setupKeys.docs(accountId) }),
  });
}

export function useWishes(accountId: string) {
  return useQuery({
    queryKey: setupKeys.wishes(accountId),
    queryFn: async (): Promise<ProductWish[]> => {
      const { data, error } = await supabase
        .from("product_wishes")
        .select("id, title, description, importance, status, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductWish[];
    },
  });
}

export function useDeleteWish(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_wishes")
        .delete()
        .eq("account_id", accountId)
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: setupKeys.wishes(accountId) }),
  });
}
