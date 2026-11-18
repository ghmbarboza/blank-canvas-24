// Biblioteca de dados: arquivo enviado, página do site ou item do Drive vira trechos em kb_articles
// (interno, publicado), que os agentes já consultam. Apagar o documento apaga os trechos (cascade).
import { admin } from "@/backend/http.server";

import { chunkText, htmlToText } from "./text";

export const ACCEPTED = /\.(pdf|docx|txt|md|csv|html?|json)$/i;
const MAX_CHARS = 400_000;

/** Texto de um arquivo pelo tipo (PDF, Word, texto, planilha CSV, HTML). */
export async function extractText(
  bytes: Uint8Array,
  name: string,
  mime: string | null,
): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") {
    const { extractText: pdf, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(bytes);
    const { text } = await pdf(doc, { mergePages: true });
    return String(text);
  }
  if (lower.endsWith(".docx") || mime?.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return r.value;
  }
  const raw = new TextDecoder().decode(bytes);
  if (lower.endsWith(".html") || lower.endsWith(".htm") || mime?.includes("html"))
    return htmlToText(raw).text;
  return raw;
}

function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "documento"
  );
}

/** Grava os trechos do documento na base e enfileira os embeddings. */
export async function indexDocument(
  accountId: string,
  documentId: string,
  title: string,
  text: string,
  category: string,
) {
  const db = admin();
  const clean = text.split(String.fromCharCode(0)).join("").trim().slice(0, MAX_CHARS);
  if (clean.length < 20) throw new Error("não encontrei texto legível neste arquivo");
  const parts = chunkText(clean);
  await db.from("kb_articles").delete().eq("document_id", documentId);
  const base = slugify(title);
  const rows = parts.map((body, i) => ({
    account_id: accountId,
    document_id: documentId,
    title: parts.length > 1 ? `${title} (parte ${i + 1})`.slice(0, 200) : title.slice(0, 200),
    slug: `${base}-${documentId.slice(0, 8)}-${i + 1}`,
    category: category.slice(0, 60),
    body_md: body,
    visibility: "internal",
    status: "published",
  }));
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await db
      .from("kb_articles")
      .insert(rows.slice(i, i + 50))
      .select("id");
    if (error) throw new Error(`base de conhecimento: ${error.message}`);
    await db.from("jobs").insert(
      (data ?? []).map((a) => ({
        account_id: accountId,
        kind: "kb.embed",
        payload: { article_id: a.id },
        dedupe_key: `kb.embed:${a.id}`,
      })) as never,
    );
  }
  await db
    .from("kb_documents")
    .update({
      status: "ready",
      error: null,
      chunks: parts.length,
      chars: clean.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  return { chunks: parts.length, chars: clean.length };
}

/** Cria o registro do documento (aparece na biblioteca como "lendo…") e devolve o id. */
export async function createDocument(p: {
  accountId: string;
  userId: string;
  name: string;
  source: "upload" | "site" | "google_drive" | "onedrive" | "texto";
  sourceRef?: string | null;
  mime?: string | null;
  size?: number | null;
  storagePath?: string | null;
}) {
  const { data, error } = await admin()
    .from("kb_documents")
    .insert({
      account_id: p.accountId,
      name: p.name.slice(0, 240),
      source: p.source,
      source_ref: p.sourceRef ?? null,
      mime: p.mime ?? null,
      size_bytes: p.size ?? null,
      storage_path: p.storagePath ?? null,
      created_by: p.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`biblioteca: ${error?.message ?? "sem linha"}`);
  return data.id;
}

export async function failDocument(documentId: string, message: string) {
  await admin()
    .from("kb_documents")
    .update({ status: "error", error: message.slice(0, 400), updated_at: new Date().toISOString() })
    .eq("id", documentId);
}

/** Arquivo enviado pela tela (já no bucket kb-docs): lê, indexa e marca pronto ou com erro. */
export async function indexUploaded(
  accountId: string,
  userId: string,
  storagePath: string,
  name: string,
  mime: string | null,
) {
  if (!storagePath.startsWith(`${accountId}/`)) throw new Error("arquivo de outra conta");
  if (!ACCEPTED.test(name))
    throw new Error("tipo de arquivo não suportado (use PDF, Word, TXT, MD, CSV ou HTML)");
  const db = admin();
  const { data: file, error } = await db.storage.from("kb-docs").download(storagePath);
  if (error || !file) throw new Error("não consegui ler o arquivo enviado");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await createDocument({
    accountId,
    userId,
    name,
    source: "upload",
    mime,
    size: bytes.byteLength,
    storagePath,
  });
  try {
    const text = await extractText(bytes, name, mime);
    const r = await indexDocument(
      accountId,
      id,
      name.replace(/\.[a-z0-9]+$/i, ""),
      text,
      "Documento",
    );
    return { documentId: id, ...r };
  } catch (err) {
    await failDocument(id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
