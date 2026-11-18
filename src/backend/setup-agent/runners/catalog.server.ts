// Catálogo pela conversa: ler o site e mostrar a prévia, cadastrar ou editar um item, listar e
// remover. O catálogo é a única fonte de preço do atendente; item sem preço entra com 0 e o
// atendente responde "preço sob consulta".
import { admin } from "@/backend/http.server";

import { parseProduto } from "../produto";
import { boolArg, s, type Runner } from "../runner-types";
import { nameKey } from "../site-import/extract";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const like = (v: string) => v.replace(/[%_\\]/g, (c) => `\\${c}`);

async function findByName(accountId: string, name: string) {
  const { data, error } = await admin()
    .from("products")
    .select("id, name, price, active")
    .eq("account_id", accountId)
    .limit(2000);
  if (error) throw new Error(error.message);
  const key = nameKey(name);
  const exact = (data ?? []).filter((p) => nameKey(p.name) === key);
  return exact.length ? exact : (data ?? []).filter((p) => nameKey(p.name).includes(key));
}

export const CATALOG_RUNNERS: Record<string, Runner> = {
  async importar_do_site(ctx, a) {
    const url = s(a["url"], 300);
    if (url.length < 4) throw new Error("faltou o endereço do site (ex.: minhaloja.com.br)");
    const imp = await import("../site-import/server");
    const preview = await imp.runPreview(ctx.caller.accountId, url);
    const content = imp.previewSummary(preview);
    if (!preview.items.length && !preview.company.sells) return { content };
    return {
      content,
      block: {
        kind: "site_import",
        title: preview.items.length
          ? `${preview.items.length} itens encontrados no site`
          : "O que li no site",
        hint: "Desmarque o que não quiser e confirme. Nada é gravado antes disso.",
        preview: {
          ...preview,
          // a conversa guarda a prévia: descrição curta para a mensagem não ficar pesada
          items: preview.items.map((i) => ({
            ...i,
            description: i.description ? i.description.slice(0, 160) : null,
          })),
        },
      },
    };
  },

  async cadastrar_produto(ctx, a) {
    const db = admin();
    const noPrice = a["preco"] === undefined || a["preco"] === null || a["preco"] === "";
    const p = parseProduto({ ...a, preco: noPrice ? 0 : a["preco"] });
    const category = s(a["categoria"], 60) || null;
    const rename = s(a["novo_nome"], 120);
    const hits = await findByName(ctx.caller.accountId, p.name);
    const atual =
      hits.length === 1
        ? hits[0]!
        : (hits.find((h) => nameKey(h.name) === nameKey(p.name)) ?? null);
    if (!atual && hits.length > 1 && rename)
      return {
        content: `Achei mais de um item parecido: ${hits.map((h) => h.name).join(", ")}. Pergunte qual.`,
      };
    const row = {
      name: rename || (atual ? atual.name : p.name),
      // editar sem dizer o preço não zera o que já estava
      price: noPrice && atual ? Number(atual.price) : p.price,
      ...(a["tipo"] !== undefined || !atual ? { kind: p.kind } : {}),
      ...(a["cobranca"] !== undefined || !atual ? { billing: p.billing } : {}),
      ...(p.description ? { description: p.description } : {}),
      ...(category ? { category } : {}),
      active: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = atual
      ? await db
          .from("products")
          .update(row)
          .eq("id", atual.id)
          .eq("account_id", ctx.caller.accountId)
      : await db.from("products").insert({ ...row, account_id: ctx.caller.accountId });
    if (error) throw new Error(`catálogo: ${error.message}`);
    const preco =
      row.price > 0 ? money(row.price) : "sem preço (o atendente diz que é sob consulta)";
    return {
      content: `${atual ? "atualizado" : "cadastrado"} no catálogo: ${row.name} (${preco})`,
      action: {
        kind: "done",
        label: `${row.name} ${atual ? "atualizado" : "no catálogo"} (${row.price > 0 ? money(row.price) : "sem preço"})`,
        tool: "cadastrar_produto",
      },
    };
  },

  async listar_catalogo(ctx, a) {
    const search = s(a["busca"], 120);
    let q = admin()
      .from("products")
      .select("name, price, category, active", { count: "exact" })
      .eq("account_id", ctx.caller.accountId)
      .order("position")
      .order("name")
      .limit(40);
    if (search) q = q.ilike("name", `%${like(search)}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    const list = data ?? [];
    if (!list.length)
      return {
        content: search
          ? `Nenhum item com "${search}" no catálogo.`
          : "O catálogo está vazio. A pessoa pode passar o site (importar_do_site) ou dizer os itens e preços.",
      };
    return {
      content: `${count ?? list.length} item(ns) no catálogo${(count ?? 0) > list.length ? ` (mostrando ${list.length})` : ""}:\n${list
        .map(
          (p) =>
            `- ${p.name}: ${Number(p.price) > 0 ? money(Number(p.price)) : "sem preço"}${p.category ? ` [${p.category}]` : ""}${p.active ? "" : " (inativo)"}`,
        )
        .join("\n")}`,
      block: {
        kind: "cards",
        title: `Catálogo: ${count ?? list.length} itens`,
        cards: list.slice(0, 6).map((p) => ({
          title: p.name.slice(0, 80),
          text: `${Number(p.price) > 0 ? money(Number(p.price)) : "Sem preço"}${p.category ? ` · ${p.category}` : ""}`,
          icon: "loja" as const,
        })),
        ...(list.length > 6
          ? { hint: "Mostrando os 6 primeiros. A lista completa fica em Ajustes, na aba Catálogo." }
          : {}),
      },
    };
  },

  async remover_produto(ctx, a) {
    const name = s(a["nome"], 120);
    if (name.length < 2) throw new Error("diga o nome do item a remover");
    const hits = await findByName(ctx.caller.accountId, name);
    if (!hits.length)
      throw new Error(`não achei "${name}" no catálogo. Use listar_catalogo para ver os nomes`);
    if (hits.length > 1)
      return {
        content: `Achei mais de um item parecido: ${hits.map((h) => h.name).join(", ")}. Pergunte qual remover.`,
      };
    const p = hits[0]!;
    if (boolArg(a["confirmado"]) !== true)
      return {
        content: `PEÇA CONFIRMAÇÃO antes: remover "${p.name}" tira o item e o preço do catálogo. Com o sim da pessoa, chame de novo com confirmado=true.`,
      };
    const { error } = await admin()
      .from("products")
      .delete()
      .eq("id", p.id)
      .eq("account_id", ctx.caller.accountId);
    if (error) throw new Error(`catálogo: ${error.message}`);
    return {
      content: `removido do catálogo: ${p.name}`,
      action: { kind: "done", label: `${p.name} removido do catálogo`, tool: "remover_produto" },
    };
  },
};
