// Base de conhecimento pela conversa: guardar (ou atualizar pelo título), listar o que existe e o
// estado de cada item, e apagar. Arquivo anexado entra pelo clipe da conversa (mesmo caminho da tela).
import { admin, type Caller } from "@/backend/http.server";

import { boolArg, s, type Runner } from "../runner-types";

const STATUS: Record<string, string> = {
  ready: "pronto",
  processing: "lendo",
  error: "com erro",
};
const SOURCE: Record<string, string> = {
  upload: "arquivo",
  site: "site",
  texto: "texto",
  google_drive: "Google Drive",
  onedrive: "OneDrive",
};

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Texto (ou pergunta e resposta) vira documento; título igual a um texto já guardado atualiza. */
export async function upsertTextDocument(
  caller: Caller,
  title: string,
  content: string,
  category: string,
): Promise<{ chunks: number; updated: boolean }> {
  if (content.trim().length < 20)
    throw new Error("o texto está curto demais: escreva pelo menos uma frase completa");
  const db = admin();
  const docs = await import("../docs.server");
  const { data: same } = await db
    .from("kb_documents")
    .select("id, name")
    .eq("account_id", caller.accountId)
    .eq("source", "texto")
    .limit(300);
  const old = (same ?? []).find((d) => norm(d.name) === norm(title));
  const id =
    old?.id ??
    (await docs.createDocument({
      accountId: caller.accountId,
      userId: caller.userId,
      name: title,
      source: "texto",
      mime: "text/markdown",
    }));
  try {
    const r = await docs.indexDocument(caller.accountId, id, title, content, category);
    return { chunks: r.chunks, updated: Boolean(old) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!old) await docs.failDocument(id, message);
    throw new Error(message);
  }
}

export const KNOWLEDGE_RUNNERS: Record<string, Runner> = {
  async guardar_conhecimento(ctx, a) {
    const title = s(a["titulo"], 200) || "Conhecimento";
    const r = await upsertTextDocument(
      ctx.caller,
      title,
      s(a["conteudo"], 60_000),
      s(a["categoria"], 60) || "Pós-venda",
    );
    return {
      content: `${r.updated ? "atualizado" : "guardado"} na base de conhecimento: "${title}" (${r.chunks} trecho(s)). O atendente já pode usar.`,
      action: {
        kind: "done",
        label: `"${title}" ${r.updated ? "atualizado" : "guardado"} na base`,
        tool: "guardar_conhecimento",
      },
    };
  },

  async listar_conhecimento(ctx) {
    const { data, error } = await admin()
      .from("kb_documents")
      .select("name, source, status, error, chunks, created_at")
      .eq("account_id", ctx.caller.accountId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    const list = data ?? [];
    if (!list.length)
      return {
        content:
          "A base de conhecimento está vazia. A pessoa pode colar um texto, mandar perguntas e respostas, anexar arquivo pelo clipe ou passar o endereço do site.",
      };
    return {
      content: list
        .map(
          (d) =>
            `- "${d.name}" (${SOURCE[d.source] ?? d.source}): ${STATUS[d.status] ?? d.status}${d.status === "error" && d.error ? `, motivo: ${d.error}` : ""}`,
        )
        .join("\n"),
      block: {
        kind: "cards",
        title: "Base de conhecimento",
        cards: list.slice(0, 6).map((d) => ({
          title: d.name.slice(0, 80),
          text: `${SOURCE[d.source] ?? d.source} · ${STATUS[d.status] ?? d.status}`,
          icon: d.source === "site" ? ("site" as const) : ("documento" as const),
        })),
        ...(list.length > 6 ? { hint: `Mostrando 6 de ${list.length} itens.` } : {}),
      },
    };
  },

  async apagar_conhecimento(ctx, a) {
    const title = s(a["titulo"], 200);
    if (title.length < 2)
      throw new Error("diga o título do item a apagar (veja em listar_conhecimento)");
    const db = admin();
    const { data } = await db
      .from("kb_documents")
      .select("id, name, storage_path")
      .eq("account_id", ctx.caller.accountId)
      .limit(300);
    const key = norm(title);
    const hits = (data ?? []).filter((d) => norm(d.name) === key);
    const loose = hits.length ? hits : (data ?? []).filter((d) => norm(d.name).includes(key));
    if (!loose.length)
      throw new Error(`não achei "${title}" na base. Use listar_conhecimento para ver os títulos`);
    if (loose.length > 1)
      return {
        content: `Achei mais de um item parecido: ${loose.map((d) => `"${d.name}"`).join(", ")}. Pergunte qual deles apagar.`,
      };
    const doc = loose[0]!;
    if (boolArg(a["confirmado"]) !== true)
      return {
        content: `PEÇA CONFIRMAÇÃO antes: apagar "${doc.name}" tira esse conteúdo do atendente. Só chame de novo com confirmado=true depois do sim da pessoa.`,
      };
    if (doc.storage_path) await db.storage.from("kb-docs").remove([doc.storage_path]);
    const { error } = await db
      .from("kb_documents")
      .delete()
      .eq("account_id", ctx.caller.accountId)
      .eq("id", doc.id);
    if (error) throw new Error(error.message);
    return {
      content: `apagado da base: "${doc.name}"`,
      action: { kind: "done", label: `"${doc.name}" apagado da base`, tool: "apagar_conhecimento" },
    };
  },
};
