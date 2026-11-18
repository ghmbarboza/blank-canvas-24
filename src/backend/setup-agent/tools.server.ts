// Ferramentas da Vi. Cada uma faz pelo mesmo caminho da tela (mesmas regras e permissões) e
// devolve, além do texto para a IA, uma ação para a tela desenhar (botão, link, "feito").
import { admin, HttpError, type Caller } from "@/backend/http.server";
import type { Json } from "@/integrations/supabase/types";
import { PROVIDERS, type ProviderId } from "@/features/integrations/providers";
import { EXTRA_MODULES } from "@/components/layout/modules";

import { compileSoul, type Soul } from "./soul";
import {
  OPENABLE,
  SEGMENT_IDS,
  STEP_IDS,
  toolInEdition,
  zernioOptionAllowed,
  type Fact,
  type SetupSnapshot,
} from "./spec";
import { hasChannel } from "@/lib/edition";
import type { StageAction, StageBlock } from "./stage";

export interface SetupAction {
  kind: "link" | "open" | "done" | "error";
  label: string;
  url?: string;
  to?: string;
  tool: string;
}

export interface ToolRun {
  content: string;
  action?: SetupAction;
}

export interface SetupCtx {
  req: Request;
  caller: Caller;
  /** O que a pessoa escreveu (esta mensagem e as anteriores): prova de que um e-mail ou uma chave veio dela. */
  userText: string;
}

// Site, documento e pesquisa podem trazer instrução escondida (prompt injection). Ação que dá acesso
// (convite) ou que grava credencial só roda com valor que a própria pessoa escreveu na conversa.
export function fromPerson(userText: string, value: string, what: string) {
  if (!value || !userText.includes(value))
    throw new Error(
      `${what} precisa ser escrito por você na conversa; não uso valor vindo de site ou documento`,
    );
}

const SEGMENT_TEMPLATE: Record<string, string | undefined> = {
  clinica: "clinica",
  imobiliaria: "imobiliaria",
  varejo: "varejo",
  saas: "saas_b2b",
  automoveis: "stand_automovel",
  escola: "escola",
};

const s = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function patchSettings(
  accountId: string,
  fn: (cur: Record<string, Json | undefined>) => Record<string, Json | undefined>,
) {
  const db = admin();
  const { data } = await db.from("accounts").select("settings").eq("id", accountId).single();
  const cur = (data?.settings ?? {}) as Record<string, Json | undefined>;
  const { error } = await db
    .from("accounts")
    .update({ settings: fn(cur) as Json })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}

export async function loadSnapshot(accountId: string): Promise<SetupSnapshot> {
  const db = admin();
  const [acc, integ, ch, ag, team, docs, wishes, inbound, replied, deals] = await Promise.all([
    db.from("accounts").select("name, settings").eq("id", accountId).single(),
    db.from("account_integrations").select("provider, status").eq("account_id", accountId),
    db
      .from("channels")
      .select("platform, name, handle")
      .eq("account_id", accountId)
      .eq("status", "connected"),
    db.from("ai_agents").select("name, status, role").eq("account_id", accountId),
    db
      .from("memberships")
      .select("user_id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("is_active", true),
    db
      .from("kb_documents")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("status", "ready"),
    db
      .from("product_wishes")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId),
    db
      .from("messages")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("direction", "in")
      .limit(1),
    db
      .from("messages")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("direction", "out")
      .eq("is_private", false)
      .in("sender_type", ["user", "ai"])
      .neq("status", "failed")
      .limit(1),
    db
      .from("deals")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .limit(1),
  ]);
  const settings = (acc.data?.settings ?? {}) as {
    setup?: { segment?: string; ai_mode?: string };
    modules?: string[];
    posvenda?: { rules?: Record<string, unknown> };
  };
  const rules = settings.posvenda?.rules;
  const rulesOn =
    rules && typeof rules === "object" ? Object.values(rules).filter((v) => v === true).length : 0;
  const aiKeys = (integ.data ?? []).filter(
    (i) => ["openai", "anthropic"].includes(i.provider) && i.status === "connected",
  );
  return {
    company: acc.data?.name ?? "Conta",
    segment: settings.setup?.segment ?? null,
    aiMode: settings.setup?.ai_mode ?? null,
    ai: aiKeys.length
      ? `chave própria (${aiKeys.map((a) => a.provider).join(", ")})`
      : "IA inclusa da plataforma",
    integrations: (integ.data ?? []).map((i) => ({ id: i.provider, status: i.status })),
    channels: (ch.data ?? []).map((c) => ({
      platform: c.platform,
      name: c.name,
      ...(c.handle ? { handle: c.handle } : {}),
    })),
    agents: (ag.data ?? []).map((a) => ({ name: a.name, status: a.status, role: a.role })),
    team: team.count ?? 0,
    documents: docs.count ?? 0,
    wishes: wishes.count ?? 0,
    modules: settings.modules ?? [],
    rulesOn,
    firstWin: {
      received: (inbound.count ?? 0) > 0,
      replied: (replied.count ?? 0) > 0,
      deal: (deals.count ?? 0) > 0,
    },
  };
}

export async function loadFacts(accountId: string): Promise<Fact[]> {
  const { data } = await admin()
    .from("setup_facts")
    .select("key, category, label, value")
    .eq("account_id", accountId)
    .order("category")
    .order("updated_at");
  return data ?? [];
}

/** O roteiro como o layout precisa: passos, o que falta e quantos obrigatórios pendentes. */
export async function loadRoteiro(accountId: string) {
  const [snapshot, facts] = await Promise.all([loadSnapshot(accountId), loadFacts(accountId)]);
  const { roteiroState } = await import("./roteiro");
  const r = roteiroState(snapshot, facts);
  const wa = snapshot.channels.find((c) => c.platform === "whatsapp");
  return {
    steps: r.steps.map((st) => ({
      id: st.id,
      title: st.title,
      summary: st.summary,
      required: st.required,
      later: st.later,
      done: st.done,
      skipped: st.skipped,
    })),
    current: r.current?.id ?? null,
    requiredPending: r.requiredPending,
    remaining: r.remaining,
    mainTotal: r.mainTotal,
    mainDone: r.mainDone,
    // o que os cartões do passo a passo mostram sem outra consulta
    detail: {
      company: snapshot.company,
      segment: snapshot.segment,
      sells: facts.find((f) => f.key === "o_que_vende")?.value ?? "",
      tone: facts.find((f) => f.key === "tom_de_voz")?.value ?? "",
      whatsapp: wa ? (wa.handle ?? wa.name) : null,
      documents: snapshot.documents,
      rulesOn: snapshot.rulesOn,
      received: snapshot.firstWin.received,
      replied: snapshot.firstWin.replied,
    },
  };
}

/** Primeiro uso: a conversa abre no passo do roteiro que falta, na hora (sem esperar a IA).
 *  Só grava se a conversa ainda está vazia; senão devolve null e o front segue o histórico. */
export async function startConversation(caller: Caller, person: string) {
  const db = admin();
  const { count } = await db
    .from("setup_messages")
    .select("id", { head: true, count: "exact" })
    .eq("account_id", caller.accountId);
  if (count) return { message: null };
  const [snapshot, facts] = await Promise.all([
    loadSnapshot(caller.accountId),
    loadFacts(caller.accountId),
  ]);
  const { opener, roteiroState } = await import("./roteiro");
  const o = opener({ state: roteiroState(snapshot, facts), company: snapshot.company, person });
  return insertOpener(caller.accountId, o.messages);
}

// Grava as mensagens da abertura uma a uma (a ordem vem do created_at de cada insert).
async function insertOpener(
  accountId: string,
  messages: { text: string; blocks: StageBlock[]; actions?: StageAction[] }[],
) {
  const db = admin();
  const saved = [];
  for (const m of messages) {
    const parts = [
      { type: "text", text: m.text },
      ...m.blocks.map((block) => ({ type: "block", block })),
      ...(m.actions ?? []).map((action) => ({ type: "action", action })),
    ];
    const { data, error } = await db
      .from("setup_messages")
      .insert({
        account_id: accountId,
        role: "assistant",
        content: m.text,
        parts: parts as unknown as Json,
      })
      .select("id, role, content, actions, parts, created_at")
      .single();
    if (error) throw new Error(error.message);
    saved.push(data);
  }
  return { message: saved[saved.length - 1] ?? null, messages: saved };
}

/**
 * "Refazer configuração inicial": esquece o que a pessoa pulou e a escolha de recursos (para a
 * Vi oferecer de novo) e abre uma rodada nova do começo. Não apaga empresa, canais, agentes,
 * conhecimento nem a conversa anterior.
 */
export async function restartConversation(caller: Caller, person: string) {
  const db = admin();
  const { error: delErr } = await db
    .from("setup_facts")
    .delete()
    .eq("account_id", caller.accountId)
    .or("key.like.pulou_%,key.eq.recursos_escolhidos");
  if (delErr) throw new Error(delErr.message);
  const [snapshot, facts] = await Promise.all([
    loadSnapshot(caller.accountId),
    loadFacts(caller.accountId),
  ]);
  const { opener, roteiroState } = await import("./roteiro");
  const o = opener({
    state: roteiroState(snapshot, facts),
    company: snapshot.company,
    person,
    restart: true,
  });
  return insertOpener(caller.accountId, o.messages);
}

/** O que a Vi aprendeu, para o painel "o que já sei": estado + fatos + biblioteca + sonhos. */
export async function loadSoul(accountId: string): Promise<Soul> {
  const db = admin();
  const [snapshot, facts, docs, wishes] = await Promise.all([
    loadSnapshot(accountId),
    loadFacts(accountId),
    db
      .from("kb_documents")
      .select("name, source, chunks")
      .eq("account_id", accountId)
      .eq("status", "ready")
      .order("created_at"),
    db
      .from("product_wishes")
      .select("title, description, importance, status")
      .eq("account_id", accountId)
      .order("created_at"),
  ]);
  return compileSoul({ snapshot, facts, documents: docs.data ?? [], wishes: wishes.data ?? [] });
}

// Os campos chegam como objeto, como texto JSON ou soltos no nível de cima, conforme o modelo.
export function fieldsArg(a: Record<string, unknown>): Record<string, unknown> {
  let campos = a["campos"];
  if (typeof campos === "string") {
    try {
      campos = JSON.parse(campos);
    } catch {
      campos = { api_key: campos };
    }
  }
  const rest = Object.fromEntries(
    Object.entries(a).filter(([k]) => k !== "provedor" && k !== "campos"),
  );
  return {
    ...rest,
    ...(campos && typeof campos === "object" ? (campos as Record<string, unknown>) : {}),
  };
}

// O modelo nem sempre usa o nome exato do campo (chave, key, apiKey, token): leva para o campo certo.
const SECRET_ALIASES = [
  "api_key",
  "apikey",
  "key",
  "chave",
  "token",
  "api_token",
  "secret",
  "segredo",
];
export function normalizeFields(
  fields: { key: string; secret?: boolean }[],
  raw: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(raw)) {
    const value = String(v ?? "").trim();
    if (!value) continue;
    const exact = fields.find((f) => norm(f.key) === norm(k));
    if (exact) {
      out[exact.key] = value;
      continue;
    }
    const secrets = fields.filter((f) => f.secret);
    if (SECRET_ALIASES.includes(norm(k)) && secrets[0] && !out[secrets[0].key])
      out[secrets[0].key] = value;
  }
  return out;
}

async function upsertFact(
  caller: Caller,
  f: { key: string; label: string; value: string; category: string; source: string },
) {
  const { error } = await admin()
    .from("setup_facts")
    .upsert(
      {
        account_id: caller.accountId,
        ...f,
        updated_by: caller.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,key" },
    );
  if (error) throw new Error(error.message);
}

/** Passo "Sua empresa": o mesmo caminho para a ferramenta da Vi e para o formulário da tela. */
export async function saveCompany(
  caller: Caller,
  p: { name?: string; segment?: string; sells?: string; tone?: string; source?: string },
): Promise<string[]> {
  const db = admin();
  const name = (p.name ?? "").trim();
  const segment = (p.segment ?? "").trim();
  const source = p.source ?? "ia";
  const done: string[] = [];
  if (segment && !(SEGMENT_IDS as readonly string[]).includes(segment))
    throw new Error(`ramo desconhecido: ${segment}`);
  if (name.length >= 2) {
    const { error } = await db.from("accounts").update({ name }).eq("id", caller.accountId);
    if (error) throw new Error(error.message);
    done.push(`nome "${name}"`);
  }
  if (segment) {
    const tplKey = SEGMENT_TEMPLATE[segment];
    if (tplKey) {
      const { segmentTemplate } = await import("@/features/gestao/templates/segments");
      const t = segmentTemplate(tplKey);
      if (t) {
        const { error } = await db.rpc("apply_segment_template", {
          _account: caller.accountId,
          _key: tplKey,
          _model: t.model as unknown as Json,
        });
        if (error) throw new Error(`modelo do ramo: ${error.message}`);
        done.push("modelo do ramo aplicado (campos, respostas e textos da IA)");
      }
    }
    await patchSettings(caller.accountId, (cur) => ({
      ...cur,
      setup: { ...((cur["setup"] as Record<string, Json>) ?? {}), segment },
    }));
    done.push(`ramo ${segment}`);
  }
  const sells = (p.sells ?? "").trim();
  if (sells) {
    await upsertFact(caller, {
      key: "o_que_vende",
      label: "O que a empresa vende",
      value: sells,
      category: "produtos",
      source,
    });
    done.push("o que vende");
  }
  const tone = (p.tone ?? "").trim();
  if (tone) {
    await upsertFact(caller, {
      key: "tom_de_voz",
      label: "Tom de voz",
      value: tone,
      category: "voz",
      source,
    });
    done.push("tom de voz");
  }
  if (!done.length) throw new Error("informe o nome ou o ramo");
  return done;
}

type Runner = (ctx: SetupCtx, args: Record<string, unknown>) => Promise<ToolRun>;

const RUNNERS: Record<string, Runner> = {
  async ver_progresso(ctx) {
    const [snap, facts] = await Promise.all([
      loadSnapshot(ctx.caller.accountId),
      loadFacts(ctx.caller.accountId),
    ]);
    return { content: JSON.stringify({ ...snap, informacoes_guardadas: facts.length }) };
  },

  async guardar_informacao(ctx, a) {
    const key = s(a["chave"], 60)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const label = s(a["rotulo"], 120);
    const value = s(a["valor"]);
    const category = s(a["categoria"], 20) || "outros";
    if (key.length < 2 || !label || !value) throw new Error("faltou chave, rótulo ou valor");
    const { error } = await admin().from("setup_facts").upsert(
      {
        account_id: ctx.caller.accountId,
        key,
        label,
        value,
        category,
        source: "ia",
        updated_by: ctx.caller.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,key" },
    );
    if (error) throw new Error(error.message);
    return { content: `guardado: ${label}` };
  },

  async cadastrar_produto(ctx, a) {
    const { parseProduto } = await import("./produto");
    const p = parseProduto(a);
    const db = admin();
    const { data: atual, error: e1 } = await db
      .from("products")
      .select("id")
      .eq("account_id", ctx.caller.accountId)
      .ilike(
        "name",
        p.name.replace(/[%_\\]/g, (c) => `\\${c}`),
      )
      .limit(1)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    const row = { ...p, active: true, updated_at: new Date().toISOString() };
    const { error } = atual
      ? await db.from("products").update(row).eq("id", atual.id)
      : await db.from("products").insert({ ...row, account_id: ctx.caller.accountId });
    if (error) throw new Error(error.message);
    const preco = p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return { content: `${atual ? "atualizado" : "cadastrado"} no catálogo: ${p.name} (${preco})` };
  },

  async apagar_informacao(ctx, a) {
    const key = s(a["chave"], 60);
    await admin()
      .from("setup_facts")
      .delete()
      .eq("account_id", ctx.caller.accountId)
      .eq("key", key);
    return { content: `apagado: ${key}` };
  },

  async salvar_empresa(ctx, a) {
    const done = await saveCompany(ctx.caller, {
      name: s(a["nome"], 120),
      segment: s(a["ramo"], 20),
      sells: s(a["o_que_vende"], 600),
      tone: s(a["tom"], 300),
    });
    return {
      content: `salvo: ${done.join(", ")}`,
      action: { kind: "done", label: "Empresa salva", tool: "salvar_empresa" },
    };
  },

  async criar_chat_do_site(ctx, a) {
    const db = admin();
    const { data: existing } = await db
      .from("channels")
      .select("id")
      .eq("account_id", ctx.caller.accountId)
      .eq("provider", "webchat")
      .limit(1)
      .maybeSingle();
    let id = existing?.id ?? null;
    if (!id) {
      const ai = a["ia"] === true;
      const { data, error } = await db
        .from("channels")
        .insert({
          account_id: ctx.caller.accountId,
          provider: "webchat",
          platform: "webchat",
          name: "Chat do site",
          external_id: `webchat-${ctx.caller.accountId}-${Date.now()}`,
          status: "connected",
          config: {
            greeting: s(a["saudacao"], 300) || "Oi! Como podemos ajudar?",
            color: "#0A1F3B",
            ai,
            ask_email: true,
          },
          ai_enabled: ai,
          is_shared: true,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "não criou o chat do site");
      id = data.id;
    }
    const origin = new URL(ctx.req.url).origin;
    const snippet = `<script src="${origin}/api/public/widget.js" data-account="${ctx.caller.accountId}" data-chat="${id}" async></script>`;
    return {
      content: `chat do site ${existing ? "já existia" : "criado"}. Mostre este código para a pessoa colar no site, antes de </body> (em bloco de código):\n${snippet}`,
      action: { kind: "done", label: "Chat do site pronto", tool: "criar_chat_do_site" },
    };
  },

  async avaliar_agente(ctx, a) {
    const db = admin();
    const name = s(a["agente"], 120);
    let q = db
      .from("ai_agents")
      .select("id, name, status")
      .eq("account_id", ctx.caller.accountId)
      .neq("role", "supervisor")
      .order("created_at", { ascending: false })
      .limit(1);
    if (name) q = q.ilike("name", name);
    const { data: agent } = await q.maybeSingle();
    if (!agent) throw new Error("não achei o agente: crie com criar_agente primeiro");
    if (agent.status === "active")
      return { content: `${agent.name} já passou na avaliação e está ligado.` };
    const ev = await import("@/backend/agents/eval.server");
    let est = await ev.estimate(ctx.caller.accountId, agent.id);
    if (!est.cases) {
      await ev.generateSuite(ctx.caller.accountId, agent.id, ctx.caller.userId);
      est = await ev.estimate(ctx.caller.accountId, agent.id);
    }
    // activate=true: se passar com 90% ou mais, o agente liga sozinho (a trava do banco confere)
    await ev.startRun(ctx.caller.accountId, agent.id, ctx.caller.userId, true);
    return {
      content: `avaliação de ${agent.name} começou com ${est.cases} perguntas (custo estimado US$ ${est.usd.toFixed(3)} da IA inclusa). Leva alguns minutos. Se passar com 90% ou mais, ele liga sozinho; se não, eu mostro o que errou para ajustar.`,
      action: {
        kind: "open",
        label: `Acompanhar a avaliação de ${agent.name}`,
        to: "/equipe-ia",
        tool: "avaliar_agente",
      },
    };
  },

  async escolher_ia(ctx, a) {
    const mode = s(a["modo"], 20);
    if (!["included", "openai", "anthropic"].includes(mode))
      throw new Error("modo de IA desconhecido: use included, openai ou anthropic");
    await patchSettings(ctx.caller.accountId, (cur) => ({
      ...cur,
      setup: { ...((cur["setup"] as Record<string, Json>) ?? {}), ai_mode: mode },
    }));
    const label =
      mode === "included"
        ? "IA inclusa escolhida"
        : `Chave própria da ${mode === "openai" ? "OpenAI" : "Anthropic"}`;
    return {
      content:
        mode === "included"
          ? "IA inclusa ligada: não precisa de chave."
          : `Modo ${mode} escolhido. Agora peça a chave e guarde com conectar_integracao (provedor ${mode}).`,
      action: { kind: "done", label, tool: "escolher_ia" },
    };
  },

  async ler_site(ctx, a) {
    const { crawlSite } = await import("./web.server");
    const pages = await crawlSite(s(a["url"], 300), 6);
    let saved = 0;
    if (a["guardar_na_biblioteca"] === true) {
      const docs = await import("./docs.server");
      for (const p of pages) {
        const id = await docs.createDocument({
          accountId: ctx.caller.accountId,
          userId: ctx.caller.userId,
          name: p.title || p.url,
          source: "site",
          sourceRef: p.url,
          mime: "text/html",
        });
        try {
          await docs.indexDocument(ctx.caller.accountId, id, p.title || p.url, p.text, "Site");
          saved++;
        } catch (err) {
          await docs.failDocument(id, err instanceof Error ? err.message : String(err));
        }
      }
    }
    const body = pages
      .map((p) => `## ${p.title} (${p.url})\n${p.text.slice(0, 3500)}`)
      .join("\n\n");
    return {
      content:
        `${pages.length} páginas lidas${saved ? `, ${saved} guardadas na biblioteca` : ""}.\n\n${body}`.slice(
          0,
          16_000,
        ),
      ...(saved
        ? {
            action: {
              kind: "done" as const,
              label: `${saved} páginas do site na biblioteca`,
              tool: "ler_site",
            },
          }
        : {}),
    };
  },

  async pesquisar_web(_ctx, a) {
    const { webSearch } = await import("./web.server");
    const r = await webSearch(s(a["consulta"], 200));
    return { content: JSON.stringify(r) };
  },

  async guardar_conhecimento(ctx, a) {
    const docs = await import("./docs.server");
    const title = s(a["titulo"], 200) || "Conhecimento";
    const id = await docs.createDocument({
      accountId: ctx.caller.accountId,
      userId: ctx.caller.userId,
      name: title,
      source: "texto",
      mime: "text/markdown",
    });
    const r = await docs.indexDocument(
      ctx.caller.accountId,
      id,
      title,
      s(a["conteudo"], 60_000),
      s(a["categoria"], 60) || "Conhecimento",
    );
    return {
      content: `guardado na biblioteca (${r.chunks} trecho(s))`,
      action: { kind: "done", label: `"${title}" na biblioteca`, tool: "guardar_conhecimento" },
    };
  },

  async conectar_integracao(ctx, a) {
    const provider = s(a["provedor"], 30) as ProviderId;
    if (!PROVIDERS.some((p) => p.id === provider))
      throw new Error(`provedor desconhecido: ${provider}`);
    const raw = fieldsArg(a);
    const def = PROVIDERS.find((p) => p.id === provider)!;
    const values = normalizeFields(def.fields, raw);
    for (const f of def.fields.filter((x) => x.secret))
      if (values[f.key]) fromPerson(ctx.userText, values[f.key]!, `A chave (${f.label})`);
    const acts = await import("@/backend/integrations-actions.server");
    await acts.saveIntegration(ctx.caller, provider, values);
    const message = def.testable
      ? await acts.testIntegration(ctx.caller, provider)
      : "salvo (esta integração confere na primeira conexão)";
    return {
      content: message,
      action: { kind: "done", label: `${def.name} conectado`, tool: "conectar_integracao" },
    };
  },

  async conectar_zernio(ctx, a) {
    fromPerson(ctx.userText, s(a["chave"], 200), "A chave da Zernio");
    const z = await import("@/backend/providers/zernio-actions.server");
    const r = (await z.saveKey(ctx.req, ctx.caller.accountId, s(a["chave"], 200))) as {
      accounts: number;
      whatsapp: number;
    };
    await z.syncAccounts(ctx.caller.accountId).catch(() => null);
    return {
      content: hasChannel("whatsapp_official")
        ? `chave da Zernio guardada: ${r.accounts} contas, ${r.whatsapp} de WhatsApp`
        : "chave da Zernio guardada e testada",
      action: { kind: "done", label: "Zernio conectada", tool: "conectar_zernio" },
    };
  },

  async link_whatsapp(ctx, a) {
    const z = await import("@/backend/providers/zernio-actions.server");
    const origin = new URL(ctx.req.url).origin;
    const r = (await z.whatsappConnect(ctx.req, ctx.caller.accountId, {
      coexistence: a["coexistencia"] === true,
      redirectUrl: `${origin}/configurar`,
    })) as { url: string };
    return {
      content: "botão de conexão gerado",
      action: { kind: "link", label: "Conectar o WhatsApp", url: r.url, tool: "link_whatsapp" },
    };
  },

  async conferir_zernio(ctx) {
    const z = await import("@/backend/providers/zernio-actions.server");
    const { optionStates } = await import("@/features/channels/zernio-catalog");
    const r = (await z.hub(ctx.caller.accountId)) as {
      ready: boolean;
      profile: boolean;
      accounts: { id: string; platform: string; name: string; active: boolean }[];
    };
    if (!r.ready) return { content: "a Zernio ainda não tem chave salva nesta conta" };
    // só o que a edição oferece (ver src/lib/edition.ts): o resto nem entra na resposta
    const st = optionStates(r.accounts).filter((x) => zernioOptionAllowed(x.option.id));
    const line = (filter: (x: (typeof st)[number]) => boolean) =>
      st
        .filter(filter)
        .map(
          (x) =>
            `${x.option.label} (${x.option.id})${x.accounts.length ? `: ${x.accounts.map((a) => a.name).join(", ")}` : ""}`,
        )
        .join("; ") || "nenhum";
    return {
      content: [
        r.profile
          ? ""
          : "ATENÇÃO: falta criar um perfil no painel da Zernio para conectar contas novas.",
        `conectado: ${line((x) => x.status === "connected")}`,
        `desconectado (precisa reconectar): ${line((x) => x.status === "problem")}`,
        `não conectado: ${line((x) => x.status === "none")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },

  async link_zernio(ctx, a) {
    const opcao = s(a["opcao"], 30).toLowerCase();
    const z = await import("@/backend/providers/zernio-actions.server");
    const { findOption } = await import("@/features/channels/zernio-catalog");
    const opt = findOption(opcao);
    if (!opt || !zernioOptionAllowed(opt.id))
      throw new Error("opção inválida: use um id da lista do conferir_zernio");
    const origin = new URL(ctx.req.url).origin;
    const r = (await z.connectOption(ctx.req, ctx.caller.accountId, {
      option: opt.id,
      redirectUrl: `${origin}/canais?conectado=1`,
    })) as { url?: string; alreadyConnected?: boolean; name?: string };
    if (r.alreadyConnected)
      return { content: `${opt.label} já está conectado na Zernio${r.name ? ` (${r.name})` : ""}` };
    return {
      content: "botão de conexão gerado",
      action: { kind: "link", label: `Conectar ${opt.label}`, url: r.url!, tool: "link_zernio" },
    };
  },

  async link_ferramenta(ctx, a) {
    const tk = s(a["ferramenta"], 40).toLowerCase();
    if (!/^[a-z_]{3,40}$/.test(tk)) throw new Error("ferramenta inválida");
    const c = await import("@/backend/agents/composio.server");
    const r = await c.connectLink(ctx.caller.accountId, ctx.caller.userId, tk);
    return {
      content: "botão de conexão gerado",
      action: {
        kind: "link",
        label: `Conectar ${tk.replace("_", " ")}`,
        url: r.url,
        tool: "link_ferramenta",
      },
    };
  },

  async importar_drive(ctx, a) {
    const d = await import("./drive.server");
    const r = await d.importFromDrive(
      ctx.caller,
      a["origem"] === "onedrive" ? "onedrive" : "google_drive",
      s(a["busca"], 120),
      Math.min(10, Number(a["limite"] ?? 5) || 5),
    );
    return {
      content: JSON.stringify(r),
      ...(r.imported.length
        ? {
            action: {
              kind: "done" as const,
              label: `${r.imported.length} arquivo(s) do Drive na biblioteca`,
              tool: "importar_drive",
            },
          }
        : {}),
    };
  },

  async criar_agente(ctx, a) {
    const { draftAgentFromText } = await import("@/backend/agents/eval.server");
    const d = await draftAgentFromText(
      ctx.caller.accountId,
      ctx.caller.userId,
      s(a["descricao"], 2000),
    );
    return {
      content: JSON.stringify({
        criado: d.name,
        papel: d.role,
        casos_de_teste: d.suite.cases,
        proximo_passo: "rodar a avaliação na Equipe de IA; o agente só atende com 90% ou mais",
      }),
      action: { kind: "open", label: `Avaliar ${d.name}`, to: "/equipe-ia", tool: "criar_agente" },
    };
  },

  async convidar_pessoa(ctx, a) {
    const email = s(a["email"], 200).toLowerCase();
    const role = s(a["papel"], 20);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("e-mail inválido");
    fromPerson(ctx.userText.toLowerCase(), email, "O e-mail do convite");
    if (!["admin", "manager", "agent", "seller"].includes(role)) throw new Error("papel inválido");
    const { data, error } = await admin()
      .from("invites")
      .insert({
        account_id: ctx.caller.accountId,
        email,
        role: role as never,
        created_by: ctx.caller.userId,
      })
      .select("token")
      .single();
    if (error || !data) throw new Error(error?.message ?? "convite não criado");
    const origin = new URL(ctx.req.url).origin;
    const url = `${origin}/convite/${data.token}`;
    return {
      content: `convite criado para ${email}; link: ${url}`,
      action: { kind: "link", label: `Link do convite de ${email}`, url, tool: "convidar_pessoa" },
    };
  },

  async registrar_desejo(ctx, a) {
    const title = s(a["titulo"], 160);
    if (title.length < 3) throw new Error("título curto demais");
    const imp = ["baixa", "media", "alta"].includes(s(a["importancia"], 10))
      ? s(a["importancia"], 10)
      : "media";
    const { error } = await admin()
      .from("product_wishes")
      .insert({
        account_id: ctx.caller.accountId,
        title,
        description: s(a["descricao"]),
        importance: imp,
        created_by: ctx.caller.userId,
      });
    if (error) throw new Error(error.message);
    return {
      content: "pedido anotado para a equipe do produto",
      action: { kind: "done", label: `Pedido anotado: ${title}`, tool: "registrar_desejo" },
    };
  },

  async ligar_recurso(ctx, a) {
    const id = s(a["recurso"], 30);
    if (!EXTRA_MODULES.some((m) => m.id === id)) throw new Error(`recurso desconhecido: ${id}`);
    const on = a["ligado"] === true;
    await patchSettings(ctx.caller.accountId, (cur) => {
      const list = new Set(Array.isArray(cur["modules"]) ? (cur["modules"] as string[]) : []);
      if (on) list.add(id);
      else list.delete(id);
      return { ...cur, modules: [...list] };
    });
    const label = EXTRA_MODULES.find((m) => m.id === id)!.label;
    return {
      content: `${label} ${on ? "ligado" : "desligado"}`,
      action: {
        kind: "done",
        label: `${label} ${on ? "no menu" : "fora do menu"}`,
        tool: "ligar_recurso",
      },
    };
  },

  async escolher_recursos(ctx, a) {
    const raw = Array.isArray(a["recursos"]) ? (a["recursos"] as unknown[]) : [];
    const ids = [...new Set(raw.map((x) => s(x, 30)))];
    const unknown = ids.filter((id) => !EXTRA_MODULES.some((m) => m.id === id));
    if (unknown.length) throw new Error(`recurso desconhecido: ${unknown.join(", ")}`);
    await patchSettings(ctx.caller.accountId, (cur) => ({ ...cur, modules: ids }));
    const labels = EXTRA_MODULES.filter((m) => ids.includes(m.id)).map((m) => m.label);
    const value = labels.length ? labels.join(", ") : "só o essencial";
    const { error } = await admin().from("setup_facts").upsert(
      {
        account_id: ctx.caller.accountId,
        key: "recursos_escolhidos",
        label: "O que a empresa quer usar",
        value,
        category: "outros",
        source: "ia",
        updated_by: ctx.caller.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,key" },
    );
    if (error) throw new Error(error.message);
    return {
      content: `menu ajustado: ${value}`,
      action: { kind: "done", label: `No menu: núcleo + ${value}`, tool: "escolher_recursos" },
    };
  },

  async abrir_passo(_ctx, a) {
    const id = s(a["passo"], 20);
    if (!(STEP_IDS as readonly string[]).includes(id)) throw new Error("passo desconhecido");
    const { stepAction } = await import("./roteiro");
    return { content: "botão do passo mostrado", action: stepAction(id as never) };
  },

  async abrir_tela(_ctx, a) {
    const to = s(a["rota"], 40);
    if (!(OPENABLE as readonly string[]).includes(to)) throw new Error("tela desconhecida");
    return {
      content: "botão mostrado",
      action: { kind: "open", label: s(a["rotulo"], 60) || "Abrir", to, tool: "abrir_tela" },
    };
  },
};

export function setupToolNames(): string[] {
  return Object.keys(RUNNERS);
}

export async function runSetupTool(
  ctx: SetupCtx,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolRun> {
  // ferramenta fora da edição não roda, mesmo que o modelo a invente
  const run = toolInEdition(name) ? RUNNERS[name] : undefined;
  if (!run) throw new HttpError(400, `ferramenta ${name} indisponível`, "bad_tool");
  return run(ctx, args);
}
