import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { callApi } from "@/lib/api";
import { callFunction, errorMessage, FunctionError } from "@/lib/functions";
import { uploadOutgoingMedia } from "@/lib/media";
import { inboxKeys } from "./keys";
import type { Message, ThreadMessage } from "./types";

// A conversa abre com as 100 mensagens mais recentes (ordem cronológica na tela).
export const MESSAGE_LIMIT = 100;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const WINDOW_CLOSED_MESSAGE =
  "Fora da janela de 24 h do WhatsApp oficial: é preciso um template aprovado.";

/** A busca no texto só roda a partir de 3 letras (menos que isso casa com quase tudo). */
export const MESSAGE_SEARCH_MIN = 3;
const MESSAGE_SEARCH_LIMIT = 500;

/** Escapa os curingas do LIKE para o texto digitado valer literalmente. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Conversas com alguma mensagem que contém o texto buscado. Passa pela RLS (cada pessoa só acha
 * o que pode ver) e usa o índice trigram de messages.body.
 */
export function useMessageSearch(accountId: string, query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: inboxKeys.messageSearch(accountId, q.toLowerCase()),
    enabled: q.length >= MESSAGE_SEARCH_MIN,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("account_id", accountId)
        .ilike("body", likePattern(q))
        .order("created_at", { ascending: false })
        .limit(MESSAGE_SEARCH_LIMIT);
      if (error) throw error;
      return new Set((data ?? []).map((m) => m.conversation_id));
    },
  });
}

export function useMessages(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: inboxKeys.messages(accountId, conversationId),
    queryFn: async (): Promise<ThreadMessage[]> => {
      // Mantém o que já foi carregado ao recarregar (paginação para trás não some).
      const loaded =
        queryClient
          .getQueryData<ThreadMessage[]>(inboxKeys.messages(accountId, conversationId))
          ?.filter((m) => !m.optimistic).length ?? 0;
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("account_id", accountId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(Math.max(MESSAGE_LIMIT, loaded));
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });
}

// Mensagens mais antigas que a primeira da tela (cursor por created_at).
export function useLoadOlderMessages(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ added: number; hasMore: boolean }> => {
      const key = inboxKeys.messages(accountId, conversationId);
      const current = queryClient.getQueryData<ThreadMessage[]>(key) ?? [];
      const first = current.find((m) => !m.optimistic);
      let q = supabase
        .from("messages")
        .select("*")
        .eq("account_id", accountId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (first) q = q.lt("created_at", first.created_at);
      const { data, error } = await q;
      if (error) throw error;
      const known = new Set(current.map((m) => m.id));
      const older = (data ?? []).filter((m) => !known.has(m.id)).reverse();
      queryClient.setQueryData<ThreadMessage[]>(key, (prev) => [...older, ...(prev ?? [])]);
      return { added: older.length, hasMore: (data ?? []).length === MESSAGE_LIMIT };
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

function upsertMessage(list: ThreadMessage[] | undefined, row: Message): ThreadMessage[] {
  const prev = list ?? [];
  const idx = prev.findIndex((m) => m.id === row.id);
  if (idx === -1) return [...prev, row];
  return prev.map((m, i) => (i === idx ? row : m));
}

export function useMessagesRealtime(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const key = inboxKeys.messages(accountId, conversationId);
    const channel = supabase
      .channel(`inbox-messages-${conversationId}-${crypto.randomUUID()}`)
      .on<Message>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            queryClient.setQueryData<ThreadMessage[]>(key, (prev) =>
              upsertMessage(prev, payload.new),
            );
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, conversationId, queryClient]);
}

interface SendInput {
  text: string;
  file: File | null;
}

function optimisticMessage(
  accountId: string,
  conversationId: string,
  userId: string,
  input: SendInput,
): ThreadMessage {
  const mime = input.file?.type ?? null;
  const type = !input.file
    ? "text"
    : mime?.startsWith("image/")
      ? "image"
      : mime?.startsWith("audio/")
        ? "audio"
        : mime?.startsWith("video/")
          ? "video"
          : "document";
  return {
    id: `temp-${crypto.randomUUID()}`,
    account_id: accountId,
    conversation_id: conversationId,
    direction: "out",
    sender_type: "user",
    sender_user_id: userId,
    sender_name: null,
    sender_handle: null,
    type,
    body: input.text || null,
    media_url: null,
    media_mime: mime,
    media_name: input.file?.name ?? null,
    transcript: null,
    is_private: false,
    external_id: null,
    reply_to_external_id: null,
    status: "queued",
    error: null,
    metadata: {},
    created_at: new Date().toISOString(),
    optimistic: true,
  };
}

function replaceTemp(
  queryClient: QueryClient,
  key: readonly unknown[],
  tempId: string,
  next: (m: ThreadMessage) => ThreadMessage | null,
) {
  queryClient.setQueryData<ThreadMessage[]>(key, (prev) =>
    (prev ?? []).flatMap((m) => {
      if (m.id !== tempId) return [m];
      const r = next(m);
      return r ? [r] : [];
    }),
  );
}

// Envio otimista: a bolha aparece com "na fila" na hora; a linha real chega pelo realtime.
export function useSendMessage(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = inboxKeys.messages(accountId, conversationId);

  return useMutation({
    mutationFn: async (input: SendInput & { tempId: string }) => {
      // Conversa de e-mail responde pelo módulo de e-mail (Resend), não pelo canal de mensagens.
      const route = await queryClient.fetchQuery({
        queryKey: ["conversation-provider", conversationId],
        staleTime: Infinity,
        queryFn: async () => {
          const { data } = await supabase
            .from("conversations")
            .select("channels(provider, platform)")
            .eq("id", conversationId)
            .maybeSingle();
          const ch = data?.channels as unknown as { provider: string; platform: string } | null;
          return ch ? `${ch.provider}:${ch.platform}` : null;
        },
      });
      const provider = route?.split(":")[0] ?? null;
      if (provider === "email") {
        const attachment = input.file
          ? {
              path: await uploadOutgoingMedia(accountId, conversationId, input.file),
              name: input.file.name,
              mime: input.file.type || "application/octet-stream",
            }
          : null;
        const r = await callApi<{ ok: boolean; messageId: string | null }>("/api/email", {
          accountId,
          action: "reply",
          conversationId,
          text: input.text ?? "",
          attachment,
        });
        return { ok: r.ok, messageId: r.messageId ?? input.tempId };
      }
      let media: { mediaPath: string; mediaMime: string; mediaName: string } | null = null;
      if (input.file) {
        const path = await uploadOutgoingMedia(accountId, conversationId, input.file);
        media = {
          mediaPath: path,
          mediaMime: input.file.type || "application/octet-stream",
          mediaName: input.file.name,
        };
      }
      // Chat do site não tem provedor externo: a resposta vai pela rota do próprio app.
      const { data: conv } = await supabase
        .from("conversations")
        .select("channels(provider, platform)")
        .eq("id", conversationId)
        .maybeSingle();
      const convChannel = conv?.channels as unknown as {
        provider?: string;
        platform?: string;
      } | null;
      // SMS pela Zadarma: a resposta sai pela rota do app, que assina a chamada da Zadarma.
      if (convChannel?.provider === "zadarma" && convChannel.platform === "sms") {
        if (!input.text) throw new FunctionError("No SMS, envie só texto", 400, "sms_text_only");
        return callApi<{ ok: boolean; messageId: string }>("/api/sms", {
          accountId,
          conversationId,
          text: input.text,
        });
      }
      if (convChannel?.provider === "webchat") {
        if (!input.text)
          throw new FunctionError("No chat do site, envie texto", 400, "webchat_text_only");
        return callApi<{ ok: boolean; messageId: string }>("/api/webchat", {
          accountId,
          conversationId,
          text: input.text,
        });
      }
      // WhatsApp pela Zernio: rota do app (modelo fora de 24 h, mídia com nome, remetente BSUID).
      if (route === "zernio:whatsapp")
        return callApi<{ ok: boolean; messageId: string }>("/api/zernio", {
          accountId,
          action: "message.send",
          conversationId,
          ...(input.text ? { text: input.text } : {}),
          ...(media ?? {}),
        });
      return callFunction<{ ok: boolean; messageId: string }>("send-message", {
        accountId,
        conversationId,
        ...(input.text ? { text: input.text } : {}),
        ...(media ?? {}),
      });
    },
    onMutate: (input) => {
      if (!user) return;
      const temp = {
        ...optimisticMessage(accountId, conversationId, user.id, input),
        id: input.tempId,
      };
      queryClient.setQueryData<ThreadMessage[]>(key, (prev) => [...(prev ?? []), temp]);
    },
    onSuccess: (res, input) => {
      const current = queryClient.getQueryData<ThreadMessage[]>(key) ?? [];
      const realArrived = current.some((m) => m.id === res.messageId);
      replaceTemp(queryClient, key, input.tempId, (m) =>
        realArrived ? null : { ...m, id: res.messageId, status: "sent" },
      );
    },
    onError: (err, input) => {
      const code = err instanceof FunctionError ? err.code : "";
      const message = code === "window_closed" ? WINDOW_CLOSED_MESSAGE : errorMessage(err);
      // provider_error: a linha real já existe e chega como "failed" pelo realtime.
      replaceTemp(queryClient, key, input.tempId, (m) =>
        code === "provider_error" ? null : { ...m, status: "failed", error: message },
      );
      if (code === "provider_error") void queryClient.invalidateQueries({ queryKey: key });
      toast.error(message);
    },
  });
}

export function useSendNote(accountId: string, conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = inboxKeys.messages(accountId, conversationId);
  return useMutation({
    mutationFn: async (text: string) => {
      if (!user) throw new Error("Sessão expirada. Entre de novo.");
      const { data, error } = await supabase
        .from("messages")
        .insert({
          account_id: accountId,
          conversation_id: conversationId,
          direction: "out",
          sender_type: "user",
          sender_user_id: user.id,
          type: "note",
          is_private: true,
          body: text,
          status: "sent",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.setQueryData<ThreadMessage[]>(key, (prev) => upsertMessage(prev, row));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export interface ReplySuggestion {
  label: string;
  text: string;
}

export function useSuggestReplies(accountId: string, conversationId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await callApi<{ suggestions: ReplySuggestion[] }>("/api/ai", {
        accountId,
        action: "suggest",
        conversationId,
      });
      return (res.suggestions ?? []).slice(0, 3);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
