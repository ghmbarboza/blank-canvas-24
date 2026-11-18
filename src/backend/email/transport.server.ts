// Provedor de envio de e-mail da conta (Resend ou Amazon SES) atrás de uma interface só.
// O motor (core.server.ts) e as campanhas não sabem quem entrega: pedem o transporte e mandam.
import { getIntegration, NotConfigured, type Integration } from "@/backend/integrations.server";
import { resendBatch, resendSend } from "@/backend/providers/resend.server";
import { sesSend, type SesCredentials } from "@/backend/providers/ses.server";

export type EmailProvider = "resend" | "ses";

export interface OutgoingEmail {
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

export interface EmailTransport {
  provider: EmailProvider;
  send(m: OutgoingEmail): Promise<{ id: string }>;
  /** Vários e-mails de uma vez (campanha). A ordem dos ids segue a ordem da entrada. */
  sendMany(ms: Omit<OutgoingEmail, "attachments">[]): Promise<{ id: string }[]>;
}

export interface SenderConfig {
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
}

export function resendTransport(apiKey: string): EmailTransport {
  return {
    provider: "resend",
    send: (m) => resendSend({ apiKey, ...m }),
    sendMany: (ms) => resendBatch(apiKey, ms),
  };
}

const SES_PARALLEL = 5; // a cota padrão do SES em produção é 14 e-mails/s

export function sesTransport(creds: SesCredentials): EmailTransport {
  return {
    provider: "ses",
    send: (m) => sesSend(creds, m),
    sendMany: async (ms) => {
      const out: { id: string }[] = new Array(ms.length);
      for (let i = 0; i < ms.length; i += SES_PARALLEL) {
        const chunk = ms.slice(i, i + SES_PARALLEL);
        const ids = await Promise.all(chunk.map((m) => sesSend(creds, m)));
        ids.forEach((r, j) => (out[i + j] = r));
      }
      return out;
    },
  };
}

function sesReady(it: Integration | null): it is Integration {
  return Boolean(
    it &&
    it.config["active"] === "yes" &&
    it.secrets["access_key_id"] &&
    it.secrets["secret_access_key"] &&
    it.config["region"] &&
    it.config["from_email"],
  );
}

function resendReady(it: Integration | null): it is Integration {
  return Boolean(it?.secrets["api_key"] && it.config["from_email"]);
}

/**
 * Provedor ativo da conta: o SES quando foi ativado e está completo; senão o Resend (padrão).
 * Lança NotConfigured quando nenhum dos dois está pronto.
 */
export async function accountTransport(
  accountId: string,
): Promise<{ transport: EmailTransport; sender: SenderConfig }> {
  const ses = await getIntegration(accountId, "ses");
  if (sesReady(ses)) {
    return {
      transport: sesTransport({
        accessKeyId: ses.secrets["access_key_id"]!,
        secretAccessKey: ses.secrets["secret_access_key"]!,
        region: ses.config["region"]!,
      }),
      sender: {
        fromEmail: ses.config["from_email"]!,
        fromName: ses.config["from_name"] || null,
        replyTo: ses.config["reply_to"] || null,
      },
    };
  }
  const resend = await getIntegration(accountId, "resend");
  if (!resendReady(resend)) throw new NotConfigured("Resend");
  return {
    transport: resendTransport(resend.secrets["api_key"]!),
    sender: {
      fromEmail: resend.config["from_email"]!,
      fromName: resend.config["from_name"] || null,
      replyTo: resend.config["reply_to"] || null,
    },
  };
}

/** Tem algum provedor de e-mail pronto? (sem lançar) */
export async function hasEmailProvider(accountId: string): Promise<boolean> {
  try {
    await accountTransport(accountId);
    return true;
  } catch (err) {
    if (err instanceof NotConfigured) return false;
    throw err;
  }
}
