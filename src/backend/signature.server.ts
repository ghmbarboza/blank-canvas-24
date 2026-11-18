// Assinatura eletrônica da proposta (ZapSign). Envio pela tela do negócio; o webhook da ZapSign marca
// a assinatura e, se a proposta ainda não estava aceita, registra o aceite pelo fluxo de sempre.
import { acceptProposal, type Proposal } from "@/backend/commerce.server";
import { HttpError, admin, safeEqual, type Caller } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { createDoc } from "@/backend/providers/zapsign.server";
import { proposalMarkdown } from "@/features/commerce/signature-doc";
import type { ProposalItem } from "@/features/commerce/totals";

const SIGNABLE = ["sent", "viewed", "accepted"];

async function zapsignCreds(accountId: string) {
  const it = await getIntegration(accountId, "zapsign");
  const token = it?.secrets["api_token"];
  if (!token)
    throw new HttpError(412, "Conecte a ZapSign em Ajustes › Integrações", "not_configured");
  return { token, env: it?.config["environment"], webhookToken: it?.secrets["webhook_token"] };
}

export async function sendForSignature(caller: Caller, proposalId: string) {
  const db = admin();
  const { data: p } = await db
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!p) throw new HttpError(404, "Proposta não encontrada", "not_found");
  if (!SIGNABLE.includes(p.status))
    throw new HttpError(409, "Envie a proposta ao cliente antes de pedir a assinatura", "not_sent");
  if (p.signature_status === "pending" || p.signature_status === "signed")
    throw new HttpError(409, "Esta proposta já foi para assinatura", "already_sent");
  const creds = await zapsignCreds(caller.accountId);

  const [{ data: contact }, { data: account }] = await Promise.all([
    p.contact_id
      ? db
          .from("contacts")
          .select("name, email, phone, company")
          .eq("id", p.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("accounts").select("name").eq("id", caller.accountId).single(),
  ]);
  if (!contact?.name || (!contact.email && !contact.phone))
    throw new HttpError(
      422,
      "O contato da proposta precisa de nome e e-mail ou telefone",
      "no_signer",
    );

  const markdown = proposalMarkdown({
    number: Number(p.number),
    version: p.version,
    title: p.title,
    company: account?.name ?? "Contratada",
    client: contact.company ? `${contact.name} (${contact.company})` : contact.name,
    items: (p.items ?? []) as unknown as ProposalItem[],
    one_time_total: Number(p.one_time_total),
    monthly_total: Number(p.monthly_total),
    yearly_total: Number(p.yearly_total),
    discount_total: Number(p.discount_total),
    total: Number(p.total),
    valid_until: p.valid_until,
    conditions: p.conditions,
  });
  const doc = await createDoc(creds.token, creds.env, {
    name: `Proposta nº ${p.number} · ${p.title}`,
    markdown,
    externalId: p.id,
    signer: { name: contact.name, email: contact.email, phone: contact.phone },
  }).catch((err: unknown) => {
    throw new HttpError(
      502,
      err instanceof Error ? err.message : "ZapSign indisponível",
      "provider",
    );
  });
  const url = doc.signers?.[0]?.sign_url ?? null;
  await db
    .from("proposals")
    .update({
      signature_provider: "zapsign",
      signature_doc_id: doc.token,
      signature_status: "pending",
      signature_url: url,
      signature_sent_at: new Date().toISOString(),
    })
    .eq("id", p.id);
  await db.from("activities").insert({
    account_id: p.account_id,
    deal_id: p.deal_id,
    contact_id: p.contact_id,
    user_id: caller.userId,
    type: "note",
    title: `Proposta nº ${p.number} enviada para assinatura (ZapSign)`,
    done_at: new Date().toISOString(),
  });
  return { ok: true, signUrl: url };
}

interface ZapsignEvent {
  event_type?: string;
  token?: string;
  status?: string;
  signed_file?: string | null;
  signers?: { name?: string; cpf?: string | null; status?: string }[];
}

export async function handleWebhook(
  req: Request,
  accountId: string,
  token: string,
  ev: ZapsignEvent,
) {
  const creds = await zapsignCreds(accountId);
  if (!creds.webhookToken || !safeEqual(token, creds.webhookToken))
    throw new HttpError(401, "Token do webhook inválido", "unauthorized");
  if (!ev.token) return { ignored: "sem documento" };
  const db = admin();
  const { data: p } = await db
    .from("proposals")
    .select("*")
    .eq("account_id", accountId)
    .eq("signature_doc_id", ev.token)
    .maybeSingle();
  if (!p) return { ignored: "documento de fora da Central de CS" };

  const type = ev.event_type ?? "";
  const signed = type === "doc_signed" || ev.status === "signed";
  const refused = type === "doc_refused" || ev.status === "refused";
  if (!signed && !refused) return { ignored: type || "evento sem efeito" };
  if (p.signature_status === "signed") return { ok: true, already: true };

  if (refused) {
    await db.from("proposals").update({ signature_status: "refused" }).eq("id", p.id);
    await db.from("activities").insert({
      account_id: p.account_id,
      deal_id: p.deal_id,
      contact_id: p.contact_id,
      type: "note",
      title: `Assinatura da proposta nº ${p.number} recusada na ZapSign`,
      done_at: new Date().toISOString(),
    });
    return { ok: true, status: "refused" };
  }

  await db
    .from("proposals")
    .update({
      signature_status: "signed",
      signed_at: new Date().toISOString(),
      signed_file_url: ev.signed_file ?? null,
    })
    .eq("id", p.id);
  const signer = ev.signers?.[0];
  if (p.status !== "accepted")
    await acceptProposal(
      p as Proposal,
      req,
      (signer?.name ?? "Cliente").slice(0, 160),
      (signer?.cpf ?? "").replace(/\D/g, "").slice(0, 14),
    );
  await db.from("activities").insert({
    account_id: p.account_id,
    deal_id: p.deal_id,
    contact_id: p.contact_id,
    type: "note",
    title: `Proposta nº ${p.number} assinada eletronicamente${signer?.name ? ` por ${signer.name}` : ""}`,
    done_at: new Date().toISOString(),
  });
  return { ok: true, status: "signed" };
}
