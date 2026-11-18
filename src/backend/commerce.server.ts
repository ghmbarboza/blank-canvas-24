// Comercial no servidor: proposta pública (ver, aceitar, recusar, pagar) e cobranças no Asaas.
import { createHash } from "node:crypto";

import { HttpError, safeEqual, admin } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { asaas } from "@/backend/providers/asaas.server";
import type { Tables } from "@/integrations/supabase/types";

export type Proposal = Tables<"proposals">;

export interface ProposalItem {
  name: string;
  kind: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  billing: "one_time" | "monthly" | "yearly";
  line_period: number;
  line_total: number;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "desconhecido"
  );
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`nexus:${ip}`).digest("hex").slice(0, 32);
}

export async function proposalByToken(token: unknown): Promise<Proposal> {
  if (typeof token !== "string" || !/^[0-9a-f]{36}$/.test(token))
    throw new HttpError(404, "Proposta não encontrada", "not_found");
  const { data } = await admin().from("proposals").select("*").eq("token", token).maybeSingle();
  if (!data) throw new HttpError(404, "Proposta não encontrada", "not_found");
  return data;
}

export function isExpired(p: Proposal): boolean {
  return (
    p.status === "expired" ||
    (Boolean(p.valid_until) &&
      p.valid_until! < new Date().toISOString().slice(0, 10) &&
      !["accepted", "declined"].includes(p.status))
  );
}

// O que o cliente vê: nada interno (sem ids de usuário, sem notas internas).
export async function publicView(p: Proposal) {
  const db = admin();
  const [{ data: account }, { data: contact }, { data: company }, asaasIt, { data: payments }] =
    await Promise.all([
      db.from("accounts").select("name, settings").eq("id", p.account_id).single(),
      p.contact_id
        ? db.from("contacts").select("name, email").eq("id", p.contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      p.company_id
        ? db.from("companies").select("name, legal_name, cnpj").eq("id", p.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
      getIntegration(p.account_id, "asaas"),
      db
        .from("payments")
        .select("kind, cycle, amount, status, billing_type, invoice_url, pix_payload, due_date")
        .eq("proposal_id", p.id)
        .order("created_at"),
    ]);
  const settings = (account?.settings ?? {}) as Record<string, unknown>;
  const brand = (settings["brand"] ?? {}) as Record<string, string>;
  // Proposta vencida e não aceita: o link continua abrindo, mas sem valores, CNPJ nem cobrança.
  const expired = isExpired(p) && p.status !== "accepted";
  return {
    seller: {
      name: account?.name ?? "",
      logo_url: brand["logo_url"] ?? null,
      color: brand["color"] ?? null,
    },
    client: {
      name: company?.name ?? contact?.name ?? null,
      legal_name: company?.legal_name ?? null,
      cnpj: expired ? null : (company?.cnpj ?? null),
    },
    proposal: {
      number: p.number,
      version: p.version,
      title: p.title,
      status: isExpired(p) ? "expired" : p.status,
      valid_until: p.valid_until,
      created_at: p.created_at,
      items: expired ? [] : (p.items as unknown as ProposalItem[]),
      one_time_total: expired ? 0 : Number(p.one_time_total),
      monthly_total: expired ? 0 : Number(p.monthly_total),
      yearly_total: expired ? 0 : Number(p.yearly_total),
      discount_total: expired ? 0 : Number(p.discount_total),
      total: expired ? 0 : Number(p.total),
      conditions: p.conditions,
      accepted_name: p.accepted_name,
      accepted_at: p.accepted_at,
    },
    can_pay: !expired && Boolean(asaasIt?.secrets["api_key"]) && asaasIt?.status !== "error",
    payments: expired ? [] : (payments ?? []),
  };
}

export async function recordView(p: Proposal, req: Request, seconds: number) {
  const db = admin();
  const first = !p.first_viewed_at;
  await db.from("proposal_views").insert({
    account_id: p.account_id,
    proposal_id: p.id,
    seconds: Math.max(0, Math.min(86_400, Math.round(seconds))),
    ip_hash: hashIp(clientIp(req)),
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  const now = new Date().toISOString();
  await db
    .from("proposals")
    .update({
      view_count: p.view_count + 1,
      last_viewed_at: now,
      ...(first ? { first_viewed_at: now } : {}),
      ...(p.status === "sent" ? { status: "viewed" } : {}),
    })
    .eq("id", p.id)
    .eq("account_id", p.account_id);
  if (first) {
    await db.rpc("emit_event", {
      _account: p.account_id,
      _type: "proposal.viewed",
      _entity: "proposal",
      _entity_id: p.id,
      _payload: { deal_id: p.deal_id, contact_id: p.contact_id },
    });
    const { data: deal } = await db
      .from("deals")
      .select("owner_user_id, title")
      .eq("id", p.deal_id)
      .eq("account_id", p.account_id)
      .maybeSingle();
    if (deal?.owner_user_id)
      await db.rpc("notify_user", {
        _account: p.account_id,
        _user: deal.owner_user_id,
        _kind: "proposal_viewed",
        _title: `Proposta nº ${p.number} aberta pelo cliente`,
        _body: deal.title,
        _link: `/crm?negocio=${p.deal_id}`,
      });
  }
}

// Tempo de leitura: atualiza a última abertura deste visitante (não conta uma nova abertura).
export async function recordReadTime(p: Proposal, req: Request, seconds: number) {
  const db = admin();
  const { data: last } = await db
    .from("proposal_views")
    .select("id, seconds")
    .eq("proposal_id", p.id)
    .eq("ip_hash", hashIp(clientIp(req)))
    .order("viewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return;
  const s = Math.max(last.seconds, Math.min(86_400, Math.round(seconds)));
  await db.from("proposal_views").update({ seconds: s }).eq("id", last.id);
}

export async function acceptProposal(p: Proposal, req: Request, name: string, document: string) {
  if (isExpired(p))
    throw new HttpError(409, "Esta proposta expirou. Peça uma nova versão.", "expired");
  if (p.status === "accepted") return;
  if (p.status === "declined") throw new HttpError(409, "Esta proposta foi recusada", "declined");
  const db = admin();
  const { error } = await db
    .from("proposals")
    .update({
      status: "accepted",
      accepted_name: name,
      accepted_document: document,
      accepted_ip: clientIp(req),
      accepted_user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", p.id)
    .eq("account_id", p.account_id)
    .in("status", ["draft", "sent", "viewed"]);
  if (error) throw new HttpError(500, "Não deu para registrar o aceite", "accept");
  const asaasIt = await getIntegration(p.account_id, "asaas");
  const awaitsPayment = Boolean(asaasIt?.secrets["api_key"]) && Number(p.total) > 0;
  await db.rpc("move_deal_to", { _deal: p.deal_id, _target: awaitsPayment ? "last_open" : "won" });
  await db.from("activities").insert({
    account_id: p.account_id,
    deal_id: p.deal_id,
    contact_id: p.contact_id,
    type: "note",
    title: `Proposta nº ${p.number} aceita por ${name}${awaitsPayment ? " · aguardando pagamento" : ""}`,
    done_at: new Date().toISOString(),
  });
  await db.rpc("emit_event", {
    _account: p.account_id,
    _type: "proposal.accepted",
    _entity: "proposal",
    _entity_id: p.id,
    _payload: { deal_id: p.deal_id, contact_id: p.contact_id, total: Number(p.total) },
  });
  const { data: deal } = await db
    .from("deals")
    .select("owner_user_id, title")
    .eq("id", p.deal_id)
    .eq("account_id", p.account_id)
    .maybeSingle();
  if (deal?.owner_user_id)
    await db.rpc("notify_user", {
      _account: p.account_id,
      _user: deal.owner_user_id,
      _kind: "proposal_accepted",
      _title: `Proposta nº ${p.number} aceita`,
      _body: `${name} aceitou "${deal.title}"`,
      _link: `/crm?negocio=${p.deal_id}`,
    });
}

export async function declineProposal(p: Proposal, reason: string) {
  if (["accepted", "declined"].includes(p.status)) return;
  const db = admin();
  await db
    .from("proposals")
    .update({ status: "declined", declined_reason: reason.slice(0, 500) || null })
    .eq("id", p.id)
    .eq("account_id", p.account_id);
  await db.from("activities").insert({
    account_id: p.account_id,
    deal_id: p.deal_id,
    contact_id: p.contact_id,
    type: "note",
    title: `Proposta nº ${p.number} recusada`,
    body: reason || null,
    done_at: new Date().toISOString(),
  });
}

// ───────────────────────── Asaas ─────────────────────────
export type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

interface AsaasCtx {
  apiKey: string;
  env: string | undefined;
}

async function asaasCtx(accountId: string): Promise<AsaasCtx> {
  const it = await getIntegration(accountId, "asaas");
  const apiKey = it?.secrets["api_key"];
  if (!apiKey)
    throw new HttpError(
      409,
      "Pagamento online não configurado (Ajustes › Integrações › Asaas)",
      "not_configured",
    );
  return { apiKey, env: it?.config["environment"] };
}

export async function ensureCustomer(
  ctx: AsaasCtx,
  c: { name: string; document: string; email?: string | null; phone?: string | null; ref: string },
) {
  const doc = c.document.replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14)
    throw new HttpError(422, "Informe CPF ou CNPJ válido para emitir a cobrança", "bad_document");
  const found = await asaas<{ data?: { id: string }[] }>(
    ctx.apiKey,
    ctx.env,
    `/customers?cpfCnpj=${doc}`,
  );
  if (found.data?.[0]) return found.data[0].id;
  const created = await asaas<{ id: string }>(ctx.apiKey, ctx.env, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: c.name,
      cpfCnpj: doc,
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { mobilePhone: c.phone.replace(/\D/g, "").slice(-11) } : {}),
      externalReference: c.ref,
      notificationDisabled: false,
    }),
  });
  return created.id;
}

function dueIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

interface ChargeInput {
  accountId: string;
  dealId: string | null;
  proposalId: string | null;
  contactId: string | null;
  customer: { name: string; document: string; email?: string | null; phone?: string | null };
  billingType: BillingType;
  oneTime: number;
  monthly: number;
  yearly: number;
  description: string;
  dueDays?: number;
  createdBy?: string | null;
}

// Cria as cobranças: avulso vira pagamento; mensal e anual viram assinatura no Asaas.
export async function createCharges(input: ChargeInput) {
  const ctx = await asaasCtx(input.accountId);
  const db = admin();
  const customerId = await ensureCustomer(ctx, {
    ...input.customer,
    ref: input.contactId ?? input.accountId,
  });
  const due = dueIn(Math.max(1, Math.min(60, input.dueDays ?? 3)));
  const out: {
    id: string;
    kind: string;
    amount: number;
    invoice_url: string | null;
    pix_payload: string | null;
    pix_image: string | null;
  }[] = [];

  const plan: {
    kind: "one_time" | "subscription";
    cycle: "MONTHLY" | "YEARLY" | null;
    amount: number;
  }[] = [];
  if (input.oneTime > 0)
    plan.push({ kind: "one_time", cycle: null, amount: round2(input.oneTime) });
  if (input.monthly > 0)
    plan.push({ kind: "subscription", cycle: "MONTHLY", amount: round2(input.monthly) });
  if (input.yearly > 0)
    plan.push({ kind: "subscription", cycle: "YEARLY", amount: round2(input.yearly) });
  if (plan.length === 0) throw new HttpError(422, "Nada a cobrar", "zero");

  for (const step of plan) {
    const { data: row, error } = await db
      .from("payments")
      .insert({
        account_id: input.accountId,
        deal_id: input.dealId,
        proposal_id: input.proposalId,
        contact_id: input.contactId,
        description: step.cycle
          ? `${input.description} (${step.cycle === "MONTHLY" ? "mensal" : "anual"})`
          : input.description,
        amount: step.amount,
        billing_type: input.billingType,
        kind: step.kind,
        cycle: step.cycle,
        due_date: due,
        asaas_customer_id: customerId,
        created_by: input.createdBy ?? null,
      })
      .select("id")
      .single();
    if (error || !row) throw new HttpError(500, "Não deu para registrar a cobrança", "insert");
    const ref = `${input.accountId}:${row.id}`;
    let paymentId: string | null = null;
    let invoiceUrl: string | null = null;
    let subscriptionId: string | null = null;
    if (step.kind === "one_time") {
      const pay = await asaas<{ id: string; invoiceUrl?: string }>(
        ctx.apiKey,
        ctx.env,
        "/payments",
        {
          method: "POST",
          body: JSON.stringify({
            customer: customerId,
            billingType: input.billingType,
            value: step.amount,
            dueDate: due,
            description: input.description,
            externalReference: ref,
          }),
        },
      );
      paymentId = pay.id;
      invoiceUrl = pay.invoiceUrl ?? null;
    } else {
      const sub = await asaas<{ id: string }>(ctx.apiKey, ctx.env, "/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType: input.billingType,
          value: step.amount,
          nextDueDate: due,
          cycle: step.cycle,
          description: input.description,
          externalReference: ref,
        }),
      });
      subscriptionId = sub.id;
      const first = await asaas<{ data?: { id: string; invoiceUrl?: string }[] }>(
        ctx.apiKey,
        ctx.env,
        `/subscriptions/${sub.id}/payments`,
      );
      paymentId = first.data?.[0]?.id ?? null;
      invoiceUrl = first.data?.[0]?.invoiceUrl ?? null;
    }
    let pixPayload: string | null = null;
    let pixImage: string | null = null;
    if (paymentId && input.billingType === "PIX") {
      try {
        const qr = await asaas<{ payload?: string; encodedImage?: string }>(
          ctx.apiKey,
          ctx.env,
          `/payments/${paymentId}/pixQrCode`,
        );
        pixPayload = qr.payload ?? null;
        pixImage = qr.encodedImage ?? null;
      } catch {
        // o QR às vezes demora segundos para ficar pronto; o link da fatura continua valendo
      }
    }
    await db
      .from("payments")
      .update({
        asaas_payment_id: paymentId,
        asaas_subscription_id: subscriptionId,
        invoice_url: invoiceUrl,
        pix_payload: pixPayload,
      })
      .eq("id", row.id)
      .eq("account_id", input.accountId);
    out.push({
      id: row.id,
      kind: step.kind,
      amount: step.amount,
      invoice_url: invoiceUrl,
      pix_payload: pixPayload,
      pix_image: pixImage,
    });
  }
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const STATUS_MAP: Record<string, string> = {
  PAYMENT_CONFIRMED: "confirmed",
  PAYMENT_RECEIVED: "received",
  PAYMENT_RECEIVED_IN_CASH: "received",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_DELETED: "canceled",
  PAYMENT_CHARGEBACK_REQUESTED: "refunded",
};

export function mapAsaasEvent(event: string): string | null {
  return STATUS_MAP[event] ?? null;
}

interface AsaasWebhook {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    subscription?: string | null;
    externalReference?: string | null;
    value?: number;
    invoiceUrl?: string;
    dueDate?: string;
    billingType?: string;
    paymentDate?: string | null;
  };
}

// Webhook do Asaas: o externalReference "<conta>:<pagamento>" diz de quem é; o token da integração prova a origem.
export async function handleAsaasWebhook(
  body: AsaasWebhook,
  token: string | null,
  accountHint: string | null = null,
) {
  // Sem token, 401 antes de qualquer coisa (S8). Com ?a=<conta> na URL, o token é conferido já,
  // mesmo para evento de cobrança que não é do Nexus.
  if (!token) throw new HttpError(401, "Token do webhook inválido", "unauthorized");
  if (accountHint) {
    if (!/^[0-9a-f-]{36}$/i.test(accountHint))
      throw new HttpError(401, "Token do webhook inválido", "unauthorized");
    const hinted = (await getIntegration(accountHint, "asaas"))?.secrets["webhook_token"];
    if (!hinted || !safeEqual(token, hinted))
      throw new HttpError(401, "Token do webhook inválido", "unauthorized");
  }
  const pay = body.payment;
  const status = mapAsaasEvent(body.event ?? "");
  const ref = pay?.externalReference ?? "";
  const [accountId, paymentRowId] = ref.split(":");
  if (
    !pay?.id ||
    !accountId ||
    !paymentRowId ||
    !/^[0-9a-f-]{36}$/i.test(accountId) ||
    !/^[0-9a-f-]{36}$/i.test(paymentRowId)
  )
    return { ignored: "sem referência do Nexus" };
  const it = await getIntegration(accountId, "asaas");
  const expected = it?.secrets["webhook_token"];
  if (!expected || !safeEqual(token, expected))
    throw new HttpError(401, "Token do webhook inválido", "unauthorized");
  if (!status) return { ignored: body.event };

  const db = admin();
  const { data: base } = await db
    .from("payments")
    .select("*")
    .eq("id", paymentRowId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!base) return { ignored: "cobrança desconhecida" };

  let rowId = base.id;
  if (base.asaas_payment_id !== pay.id) {
    // Nova parcela de assinatura: cria uma linha para ela (a primeira já existe).
    const { data: existing } = await db
      .from("payments")
      .select("id")
      .eq("asaas_payment_id", pay.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (existing) rowId = existing.id;
    else {
      const { data: inserted } = await db
        .from("payments")
        .insert({
          account_id: accountId,
          deal_id: base.deal_id,
          proposal_id: base.proposal_id,
          contact_id: base.contact_id,
          description: base.description,
          amount: pay.value ?? base.amount,
          billing_type: (pay.billingType as BillingType) ?? base.billing_type,
          kind: "subscription",
          cycle: base.cycle,
          due_date: pay.dueDate ?? null,
          invoice_url: pay.invoiceUrl ?? null,
          asaas_customer_id: base.asaas_customer_id,
          asaas_payment_id: pay.id,
          asaas_subscription_id: pay.subscription ?? base.asaas_subscription_id,
        })
        .select("id")
        .single();
      rowId = inserted?.id ?? base.id;
    }
  }
  const paid = status === "confirmed" || status === "received";
  const { data: prev } = await db
    .from("payments")
    .select("status")
    .eq("id", rowId)
    .eq("account_id", accountId)
    .maybeSingle();
  const wasPaid = prev?.status === "confirmed" || prev?.status === "received";
  await db
    .from("payments")
    .update({
      status,
      ...(paid
        ? {
            paid_at: pay.paymentDate
              ? new Date(pay.paymentDate).toISOString()
              : new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", rowId)
    .eq("account_id", accountId);

  if (paid && !wasPaid) {
    await db.rpc("emit_event", {
      _account: accountId,
      _type: "payment.confirmed",
      _entity: "payment",
      _entity_id: rowId,
      _payload: {
        deal_id: base.deal_id,
        contact_id: base.contact_id,
        amount: pay.value ?? base.amount,
      },
    });
    if (base.deal_id) await db.rpc("move_deal_to", { _deal: base.deal_id, _target: "won" });
    if (base.deal_id)
      await db.from("activities").insert({
        account_id: accountId,
        deal_id: base.deal_id,
        contact_id: base.contact_id,
        type: "note",
        title: `Pagamento confirmado: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(pay.value ?? base.amount))}`,
        done_at: new Date().toISOString(),
      });
  }
  return { ok: true, status };
}
