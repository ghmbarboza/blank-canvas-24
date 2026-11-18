// Clientes pela conversa: cadastrar um, importar uma lista colada (nome e telefone), marcar quem
// já é cliente e consultar a carteira ("quantos em risco?"). Cliente NOVO entra nas regras de
// pós-venda (pode receber mensagem de verdade): por isso pede confirmação. Lista de quem já era
// cliente entra como importação e não dispara boas-vindas atrasadas.
import { admin } from "@/backend/http.server";
import { normalizePhone } from "@/features/telephony/lib";

import { parseClientLine, parseClientList, type ParsedClient } from "../clients-parse";
import { boolArg, listArg, s, type Runner } from "../runner-types";

const MAX_BATCH = 200;
const DAY_MS = 86_400_000;

async function welcomeWouldSend(accountId: string): Promise<boolean> {
  const db = admin();
  const [acc, wa] = await Promise.all([
    db.from("accounts").select("settings").eq("id", accountId).single(),
    db
      .from("channels")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("platform", "whatsapp")
      .eq("status", "connected"),
  ]);
  const rules = ((acc.data?.settings ?? {}) as { posvenda?: { rules?: Record<string, unknown> } })
    .posvenda?.rules;
  return rules?.["boas_vindas"] === true && (wa.count ?? 0) > 0;
}

function fromArgs(a: Record<string, unknown>): { clients: ParsedClient[]; bad: string[] } {
  const clients: ParsedClient[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  const push = (c: ParsedClient | null, raw: string) => {
    if (!c) {
      if (bad.length < 10) bad.push(raw.slice(0, 80));
      return;
    }
    if (seen.has(c.phone) || clients.length >= MAX_BATCH) return;
    seen.add(c.phone);
    clients.push(c);
  };
  for (const row of listArg(a["clientes"])) {
    const name = s(row["nome"], 120);
    const phone = normalizePhone(s(row["telefone"], 40));
    const email = s(row["email"], 200).toLowerCase() || null;
    push(
      phone && phone.length >= 12 && phone.length <= 15
        ? { name: name || "Cliente", phone, email }
        : null,
      `${name} ${s(row["telefone"], 40)}`.trim(),
    );
  }
  const pasted = s(a["lista"], 30_000);
  if (pasted) {
    const r = parseClientList(pasted, MAX_BATCH);
    for (const c of r.clients) push(c, c.name);
    bad.push(...r.bad.slice(0, 10 - bad.length));
  }
  return { clients, bad };
}

export const CLIENTS_RUNNERS: Record<string, Runner> = {
  async cadastrar_clientes(ctx, a) {
    const db = admin();
    const { clients, bad } = fromArgs(a);
    if (!clients.length)
      throw new Error(
        `não consegui ler nenhum cliente com telefone válido${bad.length ? ` (ex.: "${bad[0]}")` : ""}. Peça nome e telefone com DDD, um por linha`,
      );
    // um só = cliente novo (entra nas regras); lista = quem já era cliente (não recebe boas-vindas)
    const isNew = boolArg(a["novo"]) ?? clients.length === 1;
    if (
      isNew &&
      boolArg(a["confirmado"]) !== true &&
      (await welcomeWouldSend(ctx.caller.accountId))
    )
      return {
        content: `PEÇA CONFIRMAÇÃO antes: a regra de boas-vindas está ligada e o WhatsApp está conectado, então ${clients.length === 1 ? `${clients[0]!.name} vai receber` : `${clients.length} pessoas vão receber`} a mensagem de boas-vindas de verdade agora. Se a pessoa confirmar, chame de novo com confirmado=true. Se forem clientes antigos que não devem receber mensagem, chame com novo=false.`,
      };
    const phones = clients.map((c) => c.phone);
    const { data: existing, error: e1 } = await db
      .from("contacts")
      .select("id, phone, lifecycle")
      .eq("account_id", ctx.caller.accountId)
      .in("phone", phones);
    if (e1) throw new Error(e1.message);
    const byPhone = new Map((existing ?? []).map((c) => [c.phone, c]));
    const fresh = clients.filter((c) => !byPhone.has(c.phone));
    const promote = (existing ?? []).filter((c) => c.lifecycle !== "customer").map((c) => c.id);
    for (let i = 0; i < fresh.length; i += 100) {
      const { error } = await db.from("contacts").insert(
        fresh.slice(i, i + 100).map((c) => ({
          account_id: ctx.caller.accountId,
          name: c.name,
          phone: c.phone,
          email: c.email,
          lifecycle: "customer",
          // "import…" não dispara boas-vindas (cliente antigo); cliente novo entra nas regras
          source: isNew ? "manual" : "import_conversa",
          owner_user_id: ctx.caller.userId,
        })),
      );
      if (error) throw new Error(`clientes: ${error.message}`);
    }
    if (promote.length) {
      const { error } = await db
        .from("contacts")
        .update({ lifecycle: "customer" })
        .eq("account_id", ctx.caller.accountId)
        .in("id", promote);
      if (error) throw new Error(`clientes: ${error.message}`);
    }
    const already = clients.length - fresh.length - promote.length;
    const parts = [
      fresh.length ? `${fresh.length} cadastrado(s)` : "",
      promote.length ? `${promote.length} que já estava(m) na base marcado(s) como cliente` : "",
      already ? `${already} já era(m) cliente` : "",
      bad.length
        ? `${bad.length} linha(s) sem telefone válido ficaram de fora (ex.: "${bad[0]}")`
        : "",
    ].filter(Boolean);
    return {
      content: `Clientes: ${parts.join("; ")}. ${isNew ? "Entram nas regras de pós-venda ligadas." : "Entraram como clientes antigos: não recebem boas-vindas."}`,
      action: {
        kind: "done",
        label: `Clientes: ${parts.slice(0, 2).join("; ")}`.slice(0, 160),
        tool: "cadastrar_clientes",
      },
    };
  },

  async marcar_cliente(ctx, a) {
    const db = admin();
    const who = s(a["pessoa"], 200);
    if (who.length < 2) throw new Error("diga quem (nome ou telefone)");
    const isCustomer = boolArg(a["cliente"]) ?? true;
    const phone = parseClientLine(`x ${who}`)?.phone ?? null;
    let q = db
      .from("contacts")
      .select("id, name, phone, lifecycle")
      .eq("account_id", ctx.caller.accountId)
      .limit(6);
    q = phone
      ? q.eq("phone", phone)
      : q.ilike("name", `%${who.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const hits = data ?? [];
    if (!hits.length)
      throw new Error(
        `não achei "${who}" nos contatos. Para cadastrar, use cadastrar_clientes com nome e telefone`,
      );
    if (hits.length > 1)
      return {
        content: `Achei mais de um contato: ${hits.map((c) => `${c.name ?? "sem nome"} (${c.phone ?? "sem telefone"})`).join(", ")}. Pergunte qual.`,
      };
    const c = hits[0]!;
    const target = isCustomer ? "customer" : "lead";
    if (c.lifecycle === target)
      return { content: `${c.name ?? who} já está como ${isCustomer ? "cliente" : "contato"}.` };
    if (
      isCustomer &&
      boolArg(a["confirmado"]) !== true &&
      (await welcomeWouldSend(ctx.caller.accountId))
    )
      return {
        content: `PEÇA CONFIRMAÇÃO antes: ao virar cliente, ${c.name ?? who} recebe a mensagem de boas-vindas no WhatsApp agora. Com o sim da pessoa, chame de novo com confirmado=true.`,
      };
    const { error: e2 } = await db
      .from("contacts")
      .update({ lifecycle: target })
      .eq("account_id", ctx.caller.accountId)
      .eq("id", c.id);
    if (e2) throw new Error(e2.message);
    return {
      content: `${c.name ?? who} agora é ${isCustomer ? "cliente (entra nas regras de pós-venda ligadas)" : "contato comum"}.`,
      action: {
        kind: "done",
        label: `${c.name ?? who}: ${isCustomer ? "cliente" : "contato"}`,
        tool: "marcar_cliente",
      },
    };
  },

  async consultar_clientes(ctx, a) {
    const db = admin();
    const acc = ctx.caller.accountId;
    const search = s(a["busca"], 120);
    if (search) {
      const phone = parseClientLine(`x ${search}`)?.phone ?? null;
      let q = db
        .from("contacts")
        .select("name, phone, lifecycle, tags, last_interaction_at")
        .eq("account_id", acc)
        .limit(8);
      q = phone
        ? q.eq("phone", phone)
        : q.ilike("name", `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data?.length) return { content: `Nenhum contato encontrado para "${search}".` };
      return {
        content: data
          .map(
            (c) =>
              `- ${c.name ?? "sem nome"} (${c.phone ?? "sem telefone"}): ${c.lifecycle === "customer" ? "cliente" : "contato"}${c.tags?.length ? `, etiquetas: ${c.tags.join(", ")}` : ""}${c.last_interaction_at ? `, última conversa em ${new Date(c.last_interaction_at).toLocaleDateString("pt-BR")}` : ", sem conversa ainda"}`,
          )
          .join("\n"),
      };
    }
    const count = (q: PromiseLike<{ count: number | null }>) =>
      Promise.resolve(q).then((r) => r.count ?? 0);
    const base = () =>
      db.from("contacts").select("id", { head: true, count: "exact" }).eq("account_id", acc);
    const since = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
    const [total, customers, risk, idle, fresh] = await Promise.all([
      count(base()),
      count(base().eq("lifecycle", "customer")),
      count(base().contains("tags", ["em risco"])),
      count(base().eq("lifecycle", "customer").lt("last_interaction_at", since(60))),
      count(base().eq("lifecycle", "customer").gte("created_at", since(30))),
    ]);
    return {
      content: `Carteira: ${customers} cliente(s) de ${total} contato(s). Em risco (etiqueta "em risco"): ${risk}. Clientes sem conversa há mais de 60 dias: ${idle}. Clientes cadastrados nos últimos 30 dias: ${fresh}.`,
      block: {
        kind: "cards",
        title: "Carteira de clientes",
        cards: [
          { title: `${customers} clientes`, text: `de ${total} contatos na base`, icon: "equipe" },
          { title: `${risk} em risco`, text: "com a etiqueta em risco", icon: "estrela" },
          { title: `${idle} parados`, text: "sem conversa há mais de 60 dias", icon: "calendario" },
          { title: `${fresh} novos`, text: "cadastrados nos últimos 30 dias", icon: "whatsapp" },
        ],
      },
    };
  },
};
