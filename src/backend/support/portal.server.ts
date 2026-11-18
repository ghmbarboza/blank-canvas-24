// Portal do cliente: entrar por link mágico (e-mail ou WhatsApp), ver e abrir chamados e responder.
// O cliente só enxerga os próprios chamados e só os eventos públicos. Só servidor.
import { portalEligible, portalLinkHtml } from "@/backend/contact-trust";
import { HttpError, admin, appBaseUrl, rateLimit, trustedIp } from "@/backend/http.server";

import {
  MAGIC_LINK_TTL_MS,
  SESSION_TTL_MS,
  hashToken,
  newMagicToken,
  parseIdentity,
  signSession,
  verifySession,
  type PortalSession,
} from "./portal-token";

let cachedSecret: string | null = null;
async function secret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const { data, error } = await admin().rpc("portal_secret");
  if (error || typeof data !== "string" || !data)
    throw new HttpError(503, "Portal indisponível no momento", "portal_secret");
  cachedSecret = data;
  return data;
}

export async function accountBySlug(slug: unknown) {
  const s = String(slug ?? "").toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(s)) throw new HttpError(404, "Portal não encontrado", "not_found");
  const { data } = await admin()
    .from("accounts")
    .select("id, name, slug")
    .eq("slug", s)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Portal não encontrado", "not_found");
  return data;
}

const GENERIC_SENT =
  "Se o seu contato estiver no nosso cadastro, o link de acesso chega em instantes. Ele vale por 20 minutos.";

/** Pede o link. Resposta sempre igual (não revela se o cadastro existe). */
export async function requestLink(req: Request, slug: unknown, identity: unknown) {
  const acc = await accountBySlug(slug);
  const id = parseIdentity(String(identity ?? ""));
  if (!id) throw new HttpError(400, "Digite um e-mail ou celular válido", "bad_identity");
  await rateLimit(`portal:req:ip:${trustedIp(req)}`, 10, 900);
  await rateLimit(
    `portal:req:id:${acc.id}:${hashToken(id.value).slice(0, 24)}`,
    3,
    900,
    "Já enviamos um link há pouco. Confira sua caixa de entrada ou espere alguns minutos.",
  );
  const db = admin();
  let contact: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    source: string | null;
  } | null = null;
  // Contato nascido no chat do site tem nome e e-mail só digitados por um anônimo: não recebe link
  // mágico (nem por e-mail nem por WhatsApp). Entre os demais, vale o cadastro mais antigo.
  if (id.kind === "email") {
    const { data } = await db
      .from("contacts")
      .select("id, email, phone, name, source")
      .eq("account_id", acc.id)
      .ilike("email", id.value)
      .order("created_at")
      .limit(20);
    contact = (data ?? []).find((c) => portalEligible(c.source)) ?? null;
  } else {
    const { data } = await db
      .from("contacts")
      .select("id, email, phone, name, source")
      .eq("account_id", acc.id)
      .ilike("phone", `%${id.value.slice(-8)}`)
      .order("created_at")
      .limit(20);
    contact =
      (data ?? []).find((c) => {
        if (!portalEligible(c.source)) return false;
        const d = (c.phone ?? "").replace(/\D/g, "");
        return (d.startsWith("55") ? d : `55${d}`) === id.value;
      }) ?? null;
  }
  if (!contact) return { ok: true, message: GENERIC_SENT };

  const token = newMagicToken();
  const { error } = await db.from("portal_links").insert({
    account_id: acc.id,
    contact_id: contact.id,
    token_hash: hashToken(token),
    channel: id.kind === "email" ? "email" : "whatsapp",
    expires_at: new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString(),
  });
  if (error) throw new HttpError(500, "Não deu para gerar o link. Tente de novo.", "link");
  const link = `${appBaseUrl(req)}/portal/${acc.slug}?acesso=${token}`;
  const first = (contact.name?.split(" ")[0] ?? "").slice(0, 40);
  const text = `Oi${first ? `, ${first}` : ""}. Este é o seu link para acompanhar seus chamados na ${acc.name}: ${link}\nEle vale por 20 minutos e só funciona uma vez. Se não foi você, ignore esta mensagem.`;
  if (id.kind === "email") {
    await db.rpc("enqueue_job", {
      _account: acc.id,
      _kind: "email.send",
      _payload: {
        to_email: contact.email ?? id.value,
        to_contact_id: contact.id,
        subject: `Seu acesso aos chamados da ${acc.name}`,
        html: portalLinkHtml({ first, accountName: acc.name, link }),
        text,
        category: "transactional",
      },
    });
  } else {
    await db.rpc("enqueue_job", {
      _account: acc.id,
      _kind: "whatsapp.send",
      _payload: { contact_id: contact.id, text, category: "utility" },
    });
  }
  return { ok: true, message: GENERIC_SENT };
}

/** Troca o link mágico (uso único) pela sessão assinada. */
export async function verifyLink(req: Request, slug: unknown, token: unknown) {
  const acc = await accountBySlug(slug);
  await rateLimit(`portal:verify:ip:${trustedIp(req)}`, 30, 900);
  const t = String(token ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) throw new HttpError(400, "Link inválido", "bad_token");
  const db = admin();
  // Marca como usado na mesma operação: dois cliques no mesmo link não abrem duas sessões.
  const { data } = await db
    .from("portal_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(t))
    .eq("account_id", acc.id)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("contact_id")
    .maybeSingle();
  if (!data)
    throw new HttpError(
      401,
      "Este link expirou ou já foi usado. Peça um novo abaixo.",
      "link_expired",
    );
  const session: PortalSession = {
    a: acc.id,
    c: data.contact_id,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const { data: c } = await db.from("contacts").select("name").eq("id", data.contact_id).single();
  return {
    session: signSession(session, await secret()),
    name: c?.name ?? null,
    company: acc.name,
  };
}

export async function requireSession(req: Request): Promise<PortalSession> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const s = verifySession(token, await secret());
  if (!s) throw new HttpError(401, "Sua sessão expirou. Peça um novo link.", "session_expired");
  return s;
}

const PUBLIC_STATUS = ["open", "pending", "waiting_customer", "resolved", "closed"] as const;

export async function listTickets(s: PortalSession) {
  const { data } = await admin()
    .from("tickets")
    .select("id, number, subject, status, priority, created_at, updated_at, resolved_at")
    .eq("account_id", s.a)
    .eq("contact_id", s.c)
    .order("created_at", { ascending: false })
    .limit(100);
  return { tickets: data ?? [] };
}

async function ownTicket(s: PortalSession, id: unknown) {
  const ticketId = String(id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new HttpError(400, "Chamado inválido", "bad_id");
  const { data } = await admin()
    .from("tickets")
    .select(
      "id, number, subject, description, status, priority, created_at, resolved_at, owner_user_id",
    )
    .eq("id", ticketId)
    .eq("account_id", s.a)
    .eq("contact_id", s.c)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Chamado não encontrado", "not_found");
  return data;
}

export async function getTicket(s: PortalSession, id: unknown) {
  const t = await ownTicket(s, id);
  const { data: ev } = await admin()
    .from("ticket_events")
    .select("id, kind, body, meta, author_user_id, created_at")
    .eq("ticket_id", t.id)
    .or("and(kind.eq.comment,is_public.eq.true),kind.eq.status,kind.eq.created")
    .order("created_at", { ascending: true })
    .limit(300);
  const { owner_user_id: _o, ...ticket } = t;
  return {
    ticket,
    events: (ev ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.kind === "comment" ? e.body : null,
      to: e.kind === "status" ? ((e.meta as { to?: string } | null)?.to ?? null) : null,
      from_customer: e.kind === "comment" && !e.author_user_id,
      created_at: e.created_at,
    })),
  };
}

function cleanText(v: unknown, max: number): string {
  return String(v ?? "")
    .split(String.fromCharCode(0))
    .join("")
    .trim()
    .slice(0, max);
}

export async function createTicket(s: PortalSession, subject: unknown, description: unknown) {
  const subj = cleanText(subject, 200);
  const desc = cleanText(description, 8000);
  if (subj.length < 3) throw new HttpError(400, "Escreva o assunto em poucas palavras", "subject");
  if (desc.length < 5) throw new HttpError(400, "Conte o que aconteceu", "description");
  await rateLimit(
    `portal:create:${s.c}`,
    10,
    3600,
    "Muitos chamados em pouco tempo. Tente mais tarde.",
  );
  const { data, error } = await admin().rpc("create_ticket", {
    _account: s.a,
    _subject: subj,
    _description: desc,
    _contact: s.c,
    _source: "form",
    _category: "Portal do cliente",
  });
  if (error || !data)
    throw new HttpError(500, "Não deu para abrir o chamado. Tente de novo.", "create");
  const { data: t } = await admin().from("tickets").select("id, number").eq("id", data).single();
  return { id: data, number: t?.number ?? null };
}

export async function addComment(s: PortalSession, ticketId: unknown, body: unknown) {
  const t = await ownTicket(s, ticketId);
  const text = cleanText(body, 8000);
  if (!text) throw new HttpError(400, "Escreva sua mensagem", "empty");
  if (!PUBLIC_STATUS.includes(t.status as (typeof PUBLIC_STATUS)[number]))
    throw new HttpError(409, "Chamado indisponível", "status");
  await rateLimit(`portal:comment:${s.c}`, 30, 3600, "Muitas mensagens em pouco tempo.");
  const db = admin();
  const { error } = await db.from("ticket_events").insert({
    account_id: s.a,
    ticket_id: t.id,
    kind: "comment",
    body: text,
    is_public: true,
    author_user_id: null,
    meta: { from: "customer", channel: "portal" },
  });
  if (error) throw new HttpError(500, "Não deu para enviar. Tente de novo.", "comment");
  // Cliente respondeu: o chamado volta para a fila da equipe.
  if (["waiting_customer", "pending", "resolved"].includes(t.status))
    await db.from("tickets").update({ status: "open" }).eq("id", t.id);
  if (t.owner_user_id)
    await db.rpc("notify_user", {
      _account: s.a,
      _user: t.owner_user_id,
      _kind: "ticket_reply",
      _title: `Cliente respondeu o chamado #${t.number}`,
      _body: text.slice(0, 200),
      _link: `/atendimento?chamado=${t.id}`,
    });
  return { ok: true };
}
