// Importa arquivos do Google Drive ou do OneDrive (conectados pela Composio) para a biblioteca.
import type { Caller } from "@/backend/http.server";
import { publicFetch } from "@/backend/net-guard.server";

import { createDocument, extractText, failDocument, indexDocument } from "./docs.server";
import {
  findDownload,
  googleExportMime,
  googleQuery,
  isReadable,
  parseFileList,
  type DriveFile,
} from "./drive";

const MAX_BYTES = 20_000_000;

async function exec(accountId: string, slug: string, args: Record<string, unknown>) {
  const { executeAction } = await import("@/backend/agents/composio.server");
  const r = await executeAction(accountId, slug, args);
  if (!r.ok) throw new Error(r.error ?? `a Composio não executou ${slug}`);
  return r.data;
}

async function bytesOf(data: unknown): Promise<{ bytes: Uint8Array; mime: string | null } | null> {
  const d = findDownload(data);
  if (!d) return null;
  if (d.text) return { bytes: new TextEncoder().encode(d.text), mime: d.mime ?? "text/plain" };
  if (d.base64)
    return { bytes: Uint8Array.from(Buffer.from(d.base64, "base64")), mime: d.mime ?? null };
  // URL do provedor (vem na resposta da Composio): só https público, cada redirecionamento conferido
  const res = await publicFetch(
    d.url!,
    { signal: AbortSignal.timeout(30_000) },
    { httpsOnly: true, maxRedirects: 3 },
  );
  if (!res.ok) throw new Error(`download do arquivo falhou (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("arquivo grande demais (máx. 20 MB)");
  return { bytes: buf, mime: d.mime ?? res.headers.get("content-type") };
}

async function listGoogle(accountId: string, search: string, limit: number): Promise<DriveFile[]> {
  const data = await exec(accountId, "GOOGLEDRIVE_FIND_FILE", {
    q: googleQuery(search),
    pageSize: Math.min(50, limit * 4),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType)",
  });
  return parseFileList(data).filter(isReadable).slice(0, limit);
}

async function downloadGoogle(accountId: string, f: DriveFile) {
  const exportMime = googleExportMime(f.mime);
  const data = exportMime
    ? await exec(accountId, "GOOGLEDRIVE_EXPORT_GOOGLE_WORKSPACE_FILE", {
        fileId: f.id,
        mimeType: exportMime,
      })
    : await exec(accountId, "GOOGLEDRIVE_DOWNLOAD_FILE", { fileId: f.id });
  const got = await bytesOf(data);
  if (!got) throw new Error("a Composio não devolveu o arquivo");
  const name = exportMime ? `${f.name}.${exportMime === "text/csv" ? "csv" : "txt"}` : f.name;
  return { ...got, name };
}

async function listOneDrive(
  accountId: string,
  search: string,
  limit: number,
): Promise<DriveFile[]> {
  const drives = parseFileList(await exec(accountId, "ONE_DRIVE_LIST_DRIVES", {}));
  const driveId = drives[0]?.id;
  if (!driveId) throw new Error("não encontrei nenhum OneDrive nesta conta");
  const items = parseFileList(
    await exec(accountId, "ONE_DRIVE_LIST_ALL_DRIVE_ITEMS", { drive_id: driveId, top: 200 }),
  );
  const term = search.toLowerCase();
  return items
    .filter((f) => isReadable(f) && (!term || f.name.toLowerCase().includes(term)))
    .slice(0, limit)
    .map((f) => ({ ...f, driveId: f.driveId ?? driveId }));
}

async function downloadOneDrive(accountId: string, f: DriveFile) {
  const data = await exec(accountId, "ONE_DRIVE_DOWNLOAD_FILE", {
    item_id: f.id,
    file_name: f.name,
    ...(f.driveId ? { drive_id: f.driveId } : {}),
  });
  const got = await bytesOf(data);
  if (!got) throw new Error("a Composio não devolveu o arquivo");
  return { ...got, name: f.name };
}

export async function importFromDrive(
  caller: Caller,
  origin: "google_drive" | "onedrive",
  search: string,
  limit: number,
) {
  const files =
    origin === "google_drive"
      ? await listGoogle(caller.accountId, search, limit)
      : await listOneDrive(caller.accountId, search, limit);
  const imported: { name: string; chunks: number }[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const f of files) {
    const id = await createDocument({
      accountId: caller.accountId,
      userId: caller.userId,
      name: f.name,
      source: origin,
      sourceRef: f.id,
      mime: f.mime,
    });
    try {
      const file =
        origin === "google_drive"
          ? await downloadGoogle(caller.accountId, f)
          : await downloadOneDrive(caller.accountId, f);
      const text = await extractText(file.bytes, file.name, file.mime);
      const r = await indexDocument(
        caller.accountId,
        id,
        f.name.replace(/\.[a-z0-9]+$/i, ""),
        text,
        origin === "google_drive" ? "Google Drive" : "OneDrive",
      );
      imported.push({ name: f.name, chunks: r.chunks });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failDocument(id, message);
      failed.push({ name: f.name, error: message });
    }
  }
  return { found: files.length, imported, failed };
}
