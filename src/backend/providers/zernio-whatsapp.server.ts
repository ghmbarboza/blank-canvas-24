import type { TemplateComponent } from "@/features/inbox/template-shape";

// WhatsApp pela Zernio: texto e mídia dentro da janela de 24 h, modelo aprovado fora dela.
// A Zernio é centrada na conversa: resposta vai em /inbox/conversations/{id}/messages; modelo
// abre (ou reaproveita) a conversa em POST /inbox/conversations com o telefone do cliente.
import { newIdempotencyKey, zernio } from "./zernio-client.server";

export interface TemplateRef {
  name: string;
  language: string;
  params?: string[];
}

export type AttachmentType = "image" | "video" | "audio" | "file";

export function attachmentTypeFor(mime: string | null | undefined): AttachmentType {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

export interface SendInWindow {
  zernioAccountId: string;
  conversationId: string;
  text?: string | null;
  media?: { url: string; mime?: string | null; name?: string | null; voiceNote?: boolean } | null;
}

/** Corpo do envio dentro da janela (puro, para teste de contrato). */
export function inWindowBody(p: SendInWindow): Record<string, unknown> {
  const body: Record<string, unknown> = { accountId: p.zernioAccountId };
  if (p.text) body["message"] = p.text;
  if (p.media) {
    const type = attachmentTypeFor(p.media.mime);
    body["attachmentUrl"] = p.media.url;
    body["attachmentType"] = type;
    if (type === "file" && p.media.name) body["attachmentName"] = p.media.name;
    if (type === "audio" && p.media.voiceNote) body["voiceNote"] = true;
  }
  return body;
}

export async function sendInWindow(apiKey: string, p: SendInWindow): Promise<string | null> {
  const r = await zernio<{ data?: { messageId?: string } }>(
    apiKey,
    `/v1/inbox/conversations/${encodeURIComponent(p.conversationId)}/messages`,
    { method: "POST", body: inWindowBody(p), idempotencyKey: newIdempotencyKey() },
  );
  return r.data?.messageId ?? null;
}

export interface SendTemplate {
  zernioAccountId: string;
  /** Telefone só com dígitos, com DDI (ex.: 5548999990000). */
  participantId: string;
  template: TemplateRef;
}

export function templateBody(p: SendTemplate): Record<string, unknown> {
  return {
    accountId: p.zernioAccountId,
    participantId: p.participantId,
    templateName: p.template.name,
    templateLanguage: p.template.language,
    templateParams: p.template.params ?? [],
  };
}

export async function sendTemplate(
  apiKey: string,
  p: SendTemplate,
): Promise<{ messageId: string | null; conversationId: string | null }> {
  const r = await zernio<{ data?: { messageId?: string; conversationId?: string } }>(
    apiKey,
    "/v1/inbox/conversations",
    {
      method: "POST",
      body: templateBody(p),
      idempotencyKey: newIdempotencyKey(),
    },
  );
  return { messageId: r.data?.messageId ?? null, conversationId: r.data?.conversationId ?? null };
}

export interface ZernioTemplate {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: TemplateComponent[];
}

export async function listTemplates(
  apiKey: string,
  zernioAccountId: string,
): Promise<ZernioTemplate[]> {
  const qs = new URLSearchParams({ accountId: zernioAccountId, status: "APPROVED" });
  const r = await zernio<{ templates?: ZernioTemplate[] }>(
    apiKey,
    `/v1/whatsapp/templates?${qs.toString()}`,
  );
  return (r.templates ?? []).filter((t) => t.status === "APPROVED");
}

/** Baixa a mídia de um WhatsApp recebido (a URL da Zernio exige a chave). */
export async function downloadMedia(
  apiKey: string | null,
  url: string,
  auth: boolean,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const res = await fetch(url, {
    headers: auth && apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`download de mídia falhou: ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) return null;
  return {
    bytes,
    mime: res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
  };
}
