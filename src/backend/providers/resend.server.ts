// Cliente mínimo do Resend (envio e verificação). Docs: https://resend.com/docs/api-reference
import { describeResendDomains, type ResendDomain } from "@/features/integrations/resend-domains";

export interface ResendSend {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  attachments?: { filename: string; content: string; content_type?: string }[];
}

export async function resendSend(m: ResendSend): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${m.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: m.from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      ...(m.text ? { text: m.text } : {}),
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
      ...(m.tags ? { tags: m.tags } : {}),
      ...(m.attachments ? { attachments: m.attachments } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id)
    throw new Error(`Resend ${res.status}: ${body.message ?? "falha no envio"}`);
  return { id: body.id };
}

export async function resendTest(apiKey: string, fromEmail?: string): Promise<string> {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Chave do Resend recusada");
  if (!res.ok) throw new Error(`Resend respondeu ${res.status}`);
  const j = (await res.json()) as { data?: ResendDomain[] };
  return describeResendDomains(j.data ?? [], fromEmail);
}

// Lote de até 100 e-mails numa chamada (o plano gratuito do Resend aceita 2 chamadas/s).
export async function resendBatch(
  apiKey: string,
  emails: Omit<ResendSend, "apiKey" | "attachments">[],
): Promise<{ id: string }[]> {
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(
      emails.map((m) => ({
        from: m.from,
        to: m.to,
        subject: m.subject,
        html: m.html,
        ...(m.text ? { text: m.text } : {}),
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
        ...(m.tags ? { tags: m.tags } : {}),
      })),
    ),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { id: string }[];
    message?: string;
  };
  if (!res.ok || !Array.isArray(body.data))
    throw new Error(`Resend lote ${res.status}: ${body.message ?? "falha"}`);
  return body.data;
}

// Conteúdo de um e-mail recebido (Resend Inbound manda só o aviso; o corpo vem por esta chamada).
export async function resendReceived(apiKey: string, id: string) {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    message_id?: string;
  };
}

export function resendDomains(apiKey: string) {
  return fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${apiKey}` },
  }).then(
    async (r) =>
      (
        (await r.json()) as {
          data?: { id: string; name: string; status: string; records?: unknown[] }[];
        }
      ).data ?? [],
  );
}
