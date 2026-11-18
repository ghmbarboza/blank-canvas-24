// Envio de WhatsApp pela Zernio numa conversa da Central de CS: dentro da janela de 24 h vai texto ou
// mídia; fora dela só modelo aprovado. Usado pela caixa de entrada, pela IA e pelas automações.
import { admin } from "@/backend/http.server";
import { isOutsideWindow, participantId } from "@/features/channels/zernio-rules";

import { requireZernioKey } from "./zernio-client.server";
import { sendInWindow, sendTemplate, type TemplateRef } from "./zernio-whatsapp.server";

export class WindowClosedError extends Error {
  code = "window_closed";
  constructor() {
    super("Fora da janela de 24 h: envie um modelo aprovado");
  }
}

export interface ZernioConv {
  id: string;
  external_thread_id: string;
  last_inbound_at: string | null;
  contact_id: string | null;
}

export interface ZernioPayload {
  text?: string | null;
  template?: TemplateRef | null;
  media?: { url: string; mime?: string | null; name?: string | null } | null;
}

const PHONE_THREAD = /^\d{8,15}$/;

/** Decide o caminho do envio (puro): modelo, resposta na conversa ou recusa. */
export function routeSend(
  conv: Pick<ZernioConv, "external_thread_id" | "last_inbound_at">,
  p: ZernioPayload,
  now = Date.now(),
):
  | { via: "template" }
  | { via: "conversation" }
  | { via: "refuse"; reason: "window_closed" | "no_thread" | "empty" } {
  if (p.template) return { via: "template" };
  if (!p.text?.trim() && !p.media) return { via: "refuse", reason: "empty" };
  if (isOutsideWindow(conv.last_inbound_at, now)) return { via: "refuse", reason: "window_closed" };
  if (PHONE_THREAD.test(conv.external_thread_id)) return { via: "refuse", reason: "no_thread" };
  return { via: "conversation" };
}

async function contactPhone(conv: ZernioConv): Promise<string | null> {
  if (conv.contact_id) {
    const { data } = await admin()
      .from("contacts")
      .select("phone")
      .eq("id", conv.contact_id)
      .maybeSingle();
    const p = participantId(data?.phone ?? null);
    if (p) return p;
  }
  return PHONE_THREAD.test(conv.external_thread_id) ? conv.external_thread_id : null;
}

/** Envia e devolve o id externo (wamid). Lança WindowClosedError fora da janela sem modelo. */
export async function dispatchZernioWhatsApp(
  accountId: string,
  zernioAccountId: string,
  conv: ZernioConv,
  p: ZernioPayload,
): Promise<string | null> {
  const route = routeSend(conv, p);
  if (route.via === "refuse") {
    if (route.reason === "window_closed") throw new WindowClosedError();
    if (route.reason === "empty") throw new Error("Mensagem vazia");
    throw new Error(
      "Esta conversa ainda não tem resposta do cliente: comece com um modelo aprovado",
    );
  }
  const apiKey = await requireZernioKey(accountId);
  if (route.via === "template" && p.template) {
    const to = await contactPhone(conv);
    if (!to) throw new Error("O contato não tem telefone: o modelo precisa do número com DDD");
    const r = await sendTemplate(apiKey, {
      zernioAccountId,
      participantId: to,
      template: p.template,
    });
    if (r.conversationId && r.conversationId !== conv.external_thread_id) {
      // Conversa aberta pelo telefone: passa a usar o id da Zernio (o webhook acha por ele).
      await admin()
        .from("conversations")
        .update({ external_thread_id: r.conversationId })
        .eq("id", conv.id);
    }
    return r.messageId;
  }
  return sendInWindow(apiKey, {
    zernioAccountId,
    conversationId: conv.external_thread_id,
    text: p.text ?? null,
    media: p.media ?? null,
  });
}
