import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const task = z.object({
  id: z.string(),
  title: z.string().nullable(),
  type: z.string(),
  due_at: z.string().nullable(),
  contact_id: z.string().nullable(),
  deal_id: z.string().nullable(),
  contact_name: z.string().nullable(),
  overdue: z.boolean().nullable(),
});
const event = z.object({
  id: z.string(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  meeting_url: z.string().nullable(),
  contact_id: z.string().nullable(),
  contact_name: z.string().nullable(),
});
const hot = z.object({
  conversation_id: z.string(),
  contact_id: z.string(),
  name: z.string().nullable(),
  score: z.number().nullable(),
  last_inbound_at: z.string().nullable(),
  last_message_preview: z.string().nullable(),
});
const stale = z.object({
  id: z.string(),
  title: z.string(),
  value: z.number().nullable(),
  updated_at: z.string(),
  contact_name: z.string().nullable(),
});
export const myDaySchema = z.object({
  tasks: z.array(task),
  events: z.array(event),
  hot_unanswered: z.array(hot),
  stale_deals: z.array(stale),
});
export type MyDay = z.infer<typeof myDaySchema>;

/** Textos de erro para quem usa: o que aconteceu e o que fazer. O detalhe técnico vai para o console. */
export const MY_DAY_ERROR = {
  unreachable: "Não conseguimos buscar a sua agenda agora. Confira a conexão e tente de novo.",
  malformed:
    "A agenda chegou incompleta e não deu para mostrar. Tente de novo em instantes; se continuar, fale com o suporte.",
} as const;

export const myDayKey = (accountId: string) => ["my-day", accountId];

export function useMyDay(accountId: string) {
  return useQuery({
    queryKey: myDayKey(accountId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_day", { _account: accountId });
      if (error) {
        console.error("[my_day] falha na consulta", error);
        throw new Error(MY_DAY_ERROR.unreachable);
      }
      const parsed = myDaySchema.safeParse(data);
      if (!parsed.success) {
        console.error("[my_day] resposta fora do formato", parsed.error.issues);
        throw new Error(MY_DAY_ERROR.malformed);
      }
      return parsed.data;
    },
  });
}

export function useCompleteTask(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("activities")
        .update({ done_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: myDayKey(accountId) });
      const prev = qc.getQueryData<MyDay>(myDayKey(accountId));
      if (prev)
        qc.setQueryData<MyDay>(myDayKey(accountId), {
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== id),
        });
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(myDayKey(accountId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: myDayKey(accountId) }),
  });
}

// Canal e foto de cada lead aquecido: uma consulta só, pelos ids que o my_day já devolveu.
export interface LeadExtra {
  platform: string | null;
  avatarUrl: string | null;
}

export function useLeadExtras(accountId: string, conversationIds: string[]) {
  const ids = [...conversationIds].sort();
  return useQuery({
    queryKey: ["my-day", accountId, "lead-extras", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, channels(platform), contacts(avatar_url)")
        .eq("account_id", accountId)
        .in("id", ids);
      if (error) throw error;
      return new Map<string, LeadExtra>(
        (data ?? []).map((row) => [
          row.id,
          {
            platform: row.channels?.platform ?? null,
            avatarUrl: row.contacts?.avatar_url ?? null,
          },
        ]),
      );
    },
  });
}

const FOLLOW_UP_DELAY_MS = 60 * 60_000;

// "Retomar": cria a tarefa de próximo passo no negócio parado. Com tarefa aberta, ele sai da lista.
export function useFollowUpDeal(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { dealId: string; title: string; userId: string }) => {
      const { error } = await supabase.from("activities").insert({
        account_id: accountId,
        deal_id: input.dealId,
        user_id: input.userId,
        type: "task",
        title: `Retomar contato: ${input.title}`,
        due_at: new Date(Date.now() + FOLLOW_UP_DELAY_MS).toISOString(),
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: myDayKey(accountId) }),
  });
}
