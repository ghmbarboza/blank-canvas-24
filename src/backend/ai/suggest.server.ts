// Sugestão de respostas para o atendente (antes na edge function `ai`, sem limite e sem a trava de
// vendedor; revisão de segurança de 04/11, S6). Agora mora em /api/ai, com as mesmas travas.
import { admin } from "@/backend/http.server";
import { callJson } from "@/backend/llm.server";

const SUGGEST_SYSTEM = `Você ajuda um atendente brasileiro a responder clientes por mensagem.
Escreva como gente: frases curtas, tom cordial e direto, sem jargão, sem emojis em excesso.
Nunca prometa preço, prazo ou condição que não esteja na conversa. Se faltar informação, a resposta pergunta.
Devolva 3 opções diferentes de abordagem (ex.: objetiva, consultiva, com próximo passo).`;

export interface ReplySuggestion {
  label: string;
  text: string;
}

export async function conversationOwner(accountId: string, conversationId: string) {
  const { data } = await admin()
    .from("conversations")
    .select("id, contact_id, contacts(name, ai_summary, ai_next_step, owner_user_id)")
    .eq("id", conversationId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data) return null;
  const contact = data.contacts as unknown as {
    name?: string | null;
    ai_summary?: string | null;
    ai_next_step?: string | null;
    owner_user_id?: string | null;
  } | null;
  return { id: data.id, contact };
}

export async function suggestReplies(
  accountId: string,
  conv: NonNullable<Awaited<ReturnType<typeof conversationOwner>>>,
): Promise<ReplySuggestion[]> {
  const { data: msgs } = await admin()
    .from("messages")
    .select("direction, body, transcript, type, is_private")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(25);
  const history = (msgs ?? [])
    .reverse()
    .map(
      (m) =>
        `${m.is_private ? "Nota interna" : m.direction === "in" ? "Cliente" : "Atendente"}: ${m.body || m.transcript || `[${m.type}]`}`,
    )
    .join("\n");
  const c = conv.contact;
  const { data } = await callJson<{ suggestions: ReplySuggestion[] }>(
    accountId,
    "reply_suggestion",
    {
      system: SUGGEST_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Cliente: ${c?.name ?? "sem nome"}\nResumo: ${c?.ai_summary ?? "-"}\nPróximo passo sugerido: ${c?.ai_next_step ?? "-"}\n\nConversa:\n${history.slice(-8000)}`,
        },
      ],
      schemaName: "sugerir_respostas",
      schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Até 3 palavras" },
                text: { type: "string" },
              },
              required: ["label", "text"],
            },
          },
        },
        required: ["suggestions"],
      },
    },
  );
  return (data.suggestions ?? []).slice(0, 3);
}
