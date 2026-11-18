// Classificação de lead pela IA (porte da edge function para rota de servidor: publica junto com o
// front, sem depender do redeploy pelo agente do Lovable). Lê as conversas de todos os canais,
// grava score/temperatura/intenção/resumo/próximo passo, o interesse no catálogo e pode abrir negócio.
import { admin } from "@/backend/http.server";
import { callJson } from "@/backend/llm.server";

import {
  catalogPrompt,
  mapInterests,
  normalizeScore,
  type CatalogItem,
  type RawInterest,
} from "./interest";

interface Classification {
  score: number;
  temperature: "hot" | "warm" | "cold";
  intent: string;
  summary: string;
  next_step: string;
  signals: string[];
  suggested_deal_title: string | null;
  estimated_value: number | null;
  interests?: RawInterest[];
}

const SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Chance de virar venda nos próximos 30 dias",
    },
    temperature: { type: "string", enum: ["hot", "warm", "cold"] },
    intent: { type: "string", description: "O que a pessoa quer, em até 8 palavras" },
    summary: { type: "string", description: "Resumo da situação em até 2 frases, em português" },
    next_step: {
      type: "string",
      description: "Ação concreta recomendada ao vendedor, começando por verbo",
    },
    signals: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Evidências citadas da conversa",
    },
    suggested_deal_title: { type: ["string", "null"] },
    estimated_value: {
      type: ["number", "null"],
      description: "Valor em reais só se a conversa disser",
    },
    interests: {
      type: "array",
      maxItems: 6,
      description:
        "Itens do catálogo que o cliente demonstrou querer. Vazio se não houver catálogo ou interesse claro.",
      items: {
        type: "object",
        properties: {
          item: { type: "integer", description: "Número do item na lista do catálogo" },
          confidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "70+ pediu esse item; 40-69 sinal indireto",
          },
          evidence: { type: "string", description: "Trecho ou motivo, em até 15 palavras" },
        },
        required: ["item", "confidence", "evidence"],
      },
    },
  },
  required: ["score", "temperature", "intent", "summary", "next_step", "signals"],
};

const SYSTEM = `Você é analista comercial de uma empresa brasileira e classifica leads a partir das conversas.
Regras:
- Use só o que está nas mensagens. Não invente orçamento, prazo nem produto.
- hot (70-100): pediu preço, proposta, prazo ou quer comprar/agendar já.
- warm (35-69): interesse real, mas sem urgência ou com objeção aberta.
- cold (0-34): curiosidade, fora do perfil, sem resposta ou pediu para parar.
- Se a pessoa pediu para não ser contatada, score 0 e next_step "Respeitar o pedido e não contatar".
- Interesse: aponte só itens do catálogo pelo NÚMERO da lista. Não crie item que não está nela.
- Escreva em português do Brasil, frases curtas.`;

async function loadCatalog(accountId: string): Promise<CatalogItem[]> {
  const { data } = await admin()
    .from("products")
    .select("id, name, description, category, price, billing, keywords")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("position")
    .order("name")
    .limit(80);
  return (data ?? []).map((p, i) => ({
    ...p,
    ref: i + 1,
    price: Number(p.price) || 0,
    keywords: p.keywords ?? [],
  }));
}

export async function classifyContact(accountId: string, contactId: string) {
  const db = admin();
  const { data: contact } = await db
    .from("contacts")
    .select("id, name, company, owner_user_id")
    .eq("id", contactId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!contact) throw new Error("contato não encontrado");

  const { data: convs } = await db.from("conversations").select("id").eq("contact_id", contactId);
  const convIds = (convs ?? []).map((c) => c.id);
  if (!convIds.length) return null;
  const { data: msgs } = await db
    .from("messages")
    .select("direction, body, transcript, type, created_at")
    .in("conversation_id", convIds)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(40);
  const history = (msgs ?? [])
    .reverse()
    .map(
      (m) =>
        `${m.direction === "in" ? "Cliente" : "Empresa"} (${m.created_at.slice(0, 16).replace("T", " ")}): ${m.body || m.transcript || `[${m.type}]`}`,
    )
    .join("\n");
  if (!history.trim()) return null;

  const catalog = await loadCatalog(accountId);
  const catalogText = catalog.length
    ? `\n\nCatálogo da empresa (aponte interesse pelo número):\n${catalogPrompt(catalog)}`
    : "\n\nA empresa ainda não cadastrou catálogo: devolva interests vazio.";

  const { data: result, model } = await callJson<Classification>(accountId, "lead_classification", {
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Contato: ${contact.name ?? "sem nome"}${contact.company ? ` (${contact.company})` : ""}${catalogText}\n\nConversa:\n${history.slice(-12000)}`,
      },
    ],
    schemaName: "classificar_lead",
    schema: SCHEMA,
  });

  const { score, temperature } = normalizeScore(result.score, result.temperature);
  await db
    .from("contacts")
    .update({
      score,
      temperature,
      ai_intent: result.intent?.slice(0, 120) ?? null,
      ai_summary: result.summary?.slice(0, 600) ?? null,
      ai_next_step: result.next_step?.slice(0, 300) ?? null,
      classified_at: new Date().toISOString(),
    })
    .eq("id", contactId);
  await db.from("ai_classifications").insert({
    account_id: accountId,
    contact_id: contactId,
    score,
    temperature,
    intent: result.intent,
    summary: result.summary,
    next_step: result.next_step,
    signals: (result.signals ?? []) as never,
    model,
  });

  const interests = mapInterests(result.interests, catalog);
  let saved = 0;
  if (interests.length) {
    const { data: manual } = await db
      .from("contact_interests")
      .select("product_id")
      .eq("contact_id", contactId)
      .eq("source", "manual");
    const keep = new Set((manual ?? []).map((m) => m.product_id));
    const rows = interests
      .filter((i) => !keep.has(i.product_id))
      .map((i) => ({ account_id: accountId, contact_id: contactId, source: "ai", ...i }));
    if (rows.length) {
      const { error } = await db
        .from("contact_interests")
        .upsert(rows, { onConflict: "contact_id,product_id" });
      if (error) throw new Error(`interesse: ${error.message}`);
    }
    saved = interests.length;
  }
  await maybeOpenDeal(accountId, contact, score, result, saved > 0);
  return {
    score,
    temperature,
    intent: result.intent,
    summary: result.summary,
    next_step: result.next_step,
    interests: saved,
  };
}

async function maybeOpenDeal(
  accountId: string,
  contact: { id: string; name: string | null; owner_user_id: string | null },
  score: number,
  result: Classification,
  hasInterest: boolean,
) {
  const db = admin();
  const { data: account } = await db
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .single();
  const settings = (account?.settings ?? {}) as {
    auto_deal?: boolean;
    auto_deal_min_score?: number;
  };
  if (settings.auto_deal === false || score < (settings.auto_deal_min_score ?? 60)) return;
  if (hasInterest) {
    const { error } = await db.rpc("build_opportunity", { _contact: contact.id });
    if (error) console.error("[classify] build_opportunity", error.message);
    return;
  }
  const { count } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contact.id)
    .eq("status", "open");
  if ((count ?? 0) > 0) return;
  const { data: pipeline } = await db
    .from("pipelines")
    .select("id")
    .eq("account_id", accountId)
    .eq("is_default", true)
    .maybeSingle();
  if (!pipeline) return;
  const { data: stage } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .eq("kind", "open")
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!stage) return;
  const { data: deal } = await db
    .from("deals")
    .insert({
      account_id: accountId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      contact_id: contact.id,
      title:
        result.suggested_deal_title?.slice(0, 160) ||
        `Oportunidade · ${contact.name ?? "novo lead"}`,
      value: result.estimated_value && result.estimated_value > 0 ? result.estimated_value : 0,
      owner_user_id: contact.owner_user_id,
      source: "ia",
    })
    .select("id")
    .single();
  if (deal)
    await db.from("activities").insert({
      account_id: accountId,
      contact_id: contact.id,
      deal_id: deal.id,
      type: "ai",
      title: `Negócio aberto pela IA (score ${score})`,
      body: result.summary,
    });
}
