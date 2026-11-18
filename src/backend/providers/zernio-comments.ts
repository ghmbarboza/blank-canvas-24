// Automação de Instagram/Facebook pela Zernio (sem rede): comentário com palavra-chave, resposta
// a story, menção em story e comentário em live viram DM (e resposta pública, se quiser).
// Aqui só a validação e a montagem do corpo; quem executa é a própria Zernio, por webhook e por
// leitura a cada 10 min (um comentário é respondido uma vez só).

export const SOCIAL_TRIGGERS = ["comment", "story_reply", "story_mention", "live_comment"] as const;
export type SocialTrigger = (typeof SOCIAL_TRIGGERS)[number];

export interface SocialAutomationInput {
  name?: unknown;
  trigger?: unknown;
  keywords?: unknown;
  dmMessage?: unknown;
  commentReply?: unknown;
  alsoMatchInDms?: unknown;
  platformPostId?: unknown;
}

export interface SocialAutomationBody {
  name: string;
  trigger: SocialTrigger;
  keywords: string[];
  matchMode: "word";
  typoTolerance: boolean;
  dmMessage: string;
  commentReply?: string;
  publicReplyPolicy: "after_dm";
  alsoMatchInDms?: boolean;
  platformPostId?: string;
  repeatPolicy: { mode: "once" };
  isActive: true;
}

const text = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/** Valida o pedido da tela e monta o corpo da Zernio; erro em português para a pessoa. */
export function buildSocialAutomation(
  input: SocialAutomationInput,
  platform: string,
): { ok: true; body: SocialAutomationBody } | { ok: false; error: string } {
  const trigger = SOCIAL_TRIGGERS.includes(input.trigger as SocialTrigger)
    ? (input.trigger as SocialTrigger)
    : "comment";
  if (platform !== "instagram" && trigger !== "comment")
    return { ok: false, error: "Story e live só existem no Instagram" };
  const keywords = (
    Array.isArray(input.keywords) ? input.keywords : String(input.keywords ?? "").split(",")
  )
    .map((k) => text(k, 40).toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  if (trigger === "story_mention" && keywords.length)
    return { ok: false, error: "Menção em story não tem texto: deixe as palavras-chave vazias" };
  if (trigger !== "story_mention" && !keywords.length)
    return { ok: false, error: "Diga ao menos uma palavra-chave (ex.: preço, quero, link)" };
  const dmMessage = text(input.dmMessage, 1000);
  if (dmMessage.length < 2) return { ok: false, error: "Escreva a mensagem que vai na DM" };
  const commentReply = text(input.commentReply, 300);
  const post = text(input.platformPostId, 80);
  const name = text(input.name, 80) || `${LABEL[trigger]}: ${keywords.join(", ") || "menção"}`;
  return {
    ok: true,
    body: {
      name,
      trigger,
      keywords,
      matchMode: "word",
      typoTolerance: true,
      dmMessage,
      ...(commentReply && trigger === "comment" ? { commentReply } : {}),
      publicReplyPolicy: "after_dm",
      ...(input.alsoMatchInDms === true && trigger === "comment" && keywords.length
        ? { alsoMatchInDms: true }
        : {}),
      ...(post && trigger !== "story_mention" ? { platformPostId: post } : {}),
      repeatPolicy: { mode: "once" },
      isActive: true,
    },
  };
}

export const LABEL: Record<SocialTrigger, string> = {
  comment: "Comentário",
  story_reply: "Resposta ao story",
  story_mention: "Menção em story",
  live_comment: "Comentário na live",
};
