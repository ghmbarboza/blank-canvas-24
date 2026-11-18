// Leitura tolerante das respostas do Composio para Drive/OneDrive (o formato de `data` varia por
// ferramenta e versão). Puro, testado.

export interface DriveFile {
  id: string;
  name: string;
  mime: string | null;
  driveId?: string | null;
}

const GOOGLE_EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

/** Formato pedido ao exportar um arquivo nativo do Google (Docs, Planilhas, Apresentações). */
export function googleExportMime(mime: string | null): string | null {
  return mime ? (GOOGLE_EXPORT[mime] ?? null) : null;
}

const READABLE = /\.(pdf|docx|txt|md|csv|html?)$/i;
const READABLE_MIME =
  /pdf|wordprocessingml|text\/|csv|html|vnd\.google-apps\.(document|spreadsheet|presentation)/i;

export function isReadable(f: DriveFile): boolean {
  return READABLE.test(f.name) || (f.mime ? READABLE_MIME.test(f.mime) : false);
}

/** Acha a lista de arquivos em qualquer nível de `data` (files, value, items). */
export function parseFileList(data: unknown): DriveFile[] {
  const out: DriveFile[] = [];
  const visit = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 5) return;
    if (Array.isArray(v)) {
      for (const it of v) {
        if (it && typeof it === "object" && "id" in it && "name" in it) {
          const o = it as Record<string, unknown>;
          if (o["folder"] || o["mimeType"] === "application/vnd.google-apps.folder") continue;
          const parentRef = o["parentReference"] as { driveId?: string } | undefined;
          out.push({
            id: String(o["id"]),
            name: String(o["name"]),
            mime:
              (o["mimeType"] as string | undefined) ??
              (o["file"] as { mimeType?: string } | undefined)?.mimeType ??
              null,
            driveId: parentRef?.driveId ?? null,
          });
        } else visit(it, depth + 1);
      }
      return;
    }
    for (const k of ["files", "value", "items", "data", "response_data", "results"])
      if (k in (v as object)) visit((v as Record<string, unknown>)[k], depth + 1);
  };
  visit(data, 0);
  return out;
}

/** Acha o arquivo baixado: link temporário (s3url/url) ou conteúdo em base64/texto. */
export function findDownload(data: unknown): {
  url?: string;
  base64?: string;
  text?: string;
  mime?: string | null;
  name?: string | null;
} | null {
  let found: ReturnType<typeof findDownload> = null;
  const visit = (v: unknown, depth: number) => {
    if (found || !v || typeof v !== "object" || depth > 6) return;
    const o = v as Record<string, unknown>;
    const url = [
      o["s3url"],
      o["s3_url"],
      o["download_url"],
      o["downloadUrl"],
      o["@microsoft.graph.downloadUrl"],
      o["url"],
    ].find((x) => typeof x === "string" && /^https:\/\//.test(x)) as string | undefined;
    const mime = (o["mimetype"] ?? o["mime_type"] ?? o["mimeType"] ?? null) as string | null;
    const name = (o["name"] ?? o["file_name"] ?? o["filename"] ?? null) as string | null;
    if (url) {
      found = { url, mime, name };
      return;
    }
    if (typeof o["content"] === "string" && (o["content"] as string).length > 20) {
      const c = o["content"] as string;
      found =
        /^[A-Za-z0-9+/=\s]+$/.test(c) && c.length % 4 === 0
          ? { base64: c, mime, name }
          : { text: c, mime, name };
      return;
    }
    for (const val of Object.values(o)) visit(val, depth + 1);
  };
  visit(data, 0);
  return found;
}

/** Consulta do Google Drive: arquivos (não pastas), fora da lixeira, com o nome buscado. */
export function googleQuery(search: string): string {
  const base = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  const term = search.replace(/['\\]/g, " ").trim();
  return term ? `${base} and name contains '${term}'` : base;
}
