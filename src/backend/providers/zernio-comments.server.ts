// Automações de Instagram/Facebook na Zernio da conta: lista, cria, liga/desliga, apaga e pede à
// IA o rascunho da DM. A Zernio executa (webhook + leitura a cada 10 min); o Vínculo só configura,
// e a conversa que nasce da DM entra na Caixa de entrada pelo mesmo webhook das mensagens.
import { HttpError, admin } from "@/backend/http.server";

import { asHttp } from "./zernio-actions.server";
import { listAccounts, requireZernioKey, zernio } from "./zernio-client.server";
import { LABEL, buildSocialAutomation, type SocialAutomationInput } from "./zernio-comments";

interface ZAutomation {
  id?: string;
  _id?: string;
  name: string;
  platform?: string;
  trigger?: string;
  accountId?: string | { _id: string };
  keywords?: string[];
  dmMessage?: string;
  commentReply?: string;
  isActive?: boolean;
  stats?: { triggered?: number; dmsSent?: number; linkClicks?: number };
}

async function socialChannels(accountId: string) {
  const { data } = await admin()
    .from("channels")
    .select("id, name, platform, external_id, handle")
    .eq("account_id", accountId)
    .eq("provider", "zernio")
    .in("platform", ["instagram", "facebook"]);
  return (data ?? []).filter((c) => c.external_id);
}

export async function listSocialAutomations(accountId: string) {
  try {
    const channels = await socialChannels(accountId);
    if (!channels.length) return { channels: [], automations: [] };
    const key = await requireZernioKey(accountId);
    const byExt = new Map(channels.map((c) => [c.external_id!, c]));
    const r = await zernio<{ automations?: ZAutomation[]; data?: ZAutomation[] }>(
      key,
      "/v1/comment-automations?limit=100",
    );
    const automations = (r.automations ?? r.data ?? [])
      .map((a) => {
        const ext = typeof a.accountId === "string" ? a.accountId : a.accountId?._id;
        const ch = ext ? byExt.get(ext) : undefined;
        return ch
          ? {
              id: a.id ?? a._id ?? "",
              name: a.name,
              trigger: a.trigger ?? "comment",
              triggerLabel: LABEL[(a.trigger ?? "comment") as keyof typeof LABEL] ?? a.trigger,
              keywords: a.keywords ?? [],
              dmMessage: a.dmMessage ?? "",
              commentReply: a.commentReply ?? "",
              isActive: a.isActive !== false,
              channelId: ch.id,
              channelName: ch.name,
              platform: ch.platform,
              triggered: a.stats?.triggered ?? 0,
              dmsSent: a.stats?.dmsSent ?? 0,
              clicks: a.stats?.linkClicks ?? 0,
            }
          : null;
      })
      .filter((a): a is NonNullable<typeof a> => Boolean(a && a.id));
    return {
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        platform: c.platform,
        handle: c.handle,
      })),
      automations,
    };
  } catch (err) {
    asHttp(err);
  }
}

export async function createSocialAutomation(
  accountId: string,
  b: SocialAutomationInput & { channelId?: unknown },
) {
  const ch = (await socialChannels(accountId)).find((c) => c.id === b.channelId);
  if (!ch) throw new HttpError(422, "Escolha a conta do Instagram ou do Facebook", "no_channel");
  const built = buildSocialAutomation(b, ch.platform);
  if (!built.ok) throw new HttpError(422, built.error, "invalid");
  try {
    const key = await requireZernioKey(accountId);
    const acc = (await listAccounts(key)).find((a) => a._id === ch.external_id);
    const profileId = typeof acc?.profileId === "string" ? acc.profileId : acc?.profileId?._id;
    if (!profileId)
      throw new HttpError(
        422,
        "A conta não aparece mais na Zernio: sincronize os canais",
        "no_profile",
      );
    const r = await zernio<{ automation?: ZAutomation }>(key, "/v1/comment-automations", {
      method: "POST",
      body: { profileId, accountId: ch.external_id, ...built.body },
    });
    return { ok: true, id: r.automation?.id ?? r.automation?._id ?? null };
  } catch (err) {
    asHttp(err);
  }
}

function automationId(v: unknown): string {
  const id = String(v ?? "");
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new HttpError(400, "Automação inválida", "bad_id");
  return id;
}

/** Só mexe em automação de uma conta conectada neste Vínculo (a chave da Zernio pode ter outras). */
async function assertMine(accountId: string, id: string) {
  const list = await listSocialAutomations(accountId);
  if (!list.automations.some((a) => a.id === id))
    throw new HttpError(404, "Automação não encontrada", "not_found");
}

export async function toggleSocialAutomation(accountId: string, b: { id?: unknown; on?: unknown }) {
  const id = automationId(b.id);
  await assertMine(accountId, id);
  try {
    await zernio(await requireZernioKey(accountId), `/v1/comment-automations/${id}`, {
      method: "PATCH",
      body: { isActive: b.on === true },
    });
    return { ok: true };
  } catch (err) {
    asHttp(err);
  }
}

export async function removeSocialAutomation(accountId: string, b: { id?: unknown }) {
  const id = automationId(b.id);
  await assertMine(accountId, id);
  try {
    await zernio(await requireZernioKey(accountId), `/v1/comment-automations/${id}`, {
      method: "DELETE",
    });
    return { ok: true };
  } catch (err) {
    asHttp(err);
  }
}

/** Rascunho da DM e da resposta pública pela IA, com o catálogo e a base da empresa. */
export async function draftSocialAutomation(
  accountId: string,
  b: { brief?: unknown; trigger?: unknown },
) {
  const brief = String(b.brief ?? "")
    .trim()
    .slice(0, 800);
  if (brief.length < 5) throw new HttpError(422, "Conte o que a pessoa vai receber na DM", "brief");
  const { searchKb } = await import("@/backend/support/kb-search.server");
  const { callJson } = await import("@/backend/llm.server");
  const [{ data: acc }, kb] = await Promise.all([
    admin().from("accounts").select("name").eq("id", accountId).single(),
    searchKb(accountId, brief, { limit: 3 }).catch(() => []),
  ]);
  const r = await callJson<{ keywords: string[]; dmMessage: string; commentReply: string }>(
    accountId,
    "social_automation_draft",
    {
      system: [
        `Você escreve automações de Instagram para ${acc?.name ?? "a empresa"}, em português do Brasil.`,
        "dmMessage: a DM que a pessoa recebe ao comentar. Curta (até 300 caracteres), calorosa, começa com {{first_name}}, entrega o que foi prometido e termina com uma pergunta para a conversa seguir.",
        "commentReply: resposta pública curta no comentário (até 80 caracteres), avisando que mandou no direct. Vazia se o gatilho não for comentário.",
        "keywords: 1 a 4 palavras que a pessoa comentaria, minúsculas, sem #.",
        "Não invente preço, prazo nem promoção que não estejam abaixo.",
        kb.length
          ? `Base da empresa:\n${kb.map((k) => `- ${k.title}: ${k.body_md.slice(0, 500)}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      messages: [
        { role: "user", content: `Gatilho: ${String(b.trigger ?? "comment")}. Pedido: ${brief}` },
      ],
      schemaName: "automation",
      schema: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" } },
          dmMessage: { type: "string" },
          commentReply: { type: "string" },
        },
        required: ["keywords", "dmMessage", "commentReply"],
      },
      maxTokens: 800,
    },
    { tier: "reply" },
  );
  return {
    keywords: (r.data.keywords ?? [])
      .map((k) => String(k).toLowerCase().replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 4),
    dmMessage: String(r.data.dmMessage ?? "").slice(0, 1000),
    commentReply: String(r.data.commentReply ?? "").slice(0, 300),
  };
}
