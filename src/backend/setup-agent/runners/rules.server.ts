// Regras de pós-venda pela conversa: ligar e desligar cada uma (ou todas), trocar a mensagem, o
// prazo em dias e o teto de envios por dia. Cada regra é uma automação comum (template_key
// "posvenda:<chave>"), a mesma que a tela Pós-venda liga; o resumo fica em accounts.settings.
import { admin, type Caller } from "@/backend/http.server";
import type { Graph, Trigger } from "@/features/automations/engine";
import { AT_RISK_STAGE, findStage } from "@/features/posvenda/journey";
import {
  MAX_DAILY_CAP,
  RULES,
  RULE_KEYS,
  buildRuleAutomation,
  dailyCapOf,
  readRuleOptions,
  ruleDef,
  ruleKeyOf,
  templateKeyFor,
  whenText,
  withDailyCap,
  withRuleFlag,
  type RuleKey,
} from "@/features/posvenda/rules";
import type { Json } from "@/integrations/supabase/types";

import { boolArg, intArg, listArg, s, type Runner } from "../runner-types";

interface Row {
  id: string;
  status: string;
  template_key: string | null;
  trigger: Json;
  graph: Json;
  version: number;
}

// O dono fala "recompra", "pesquisa", "boas vindas": aceita o nome solto além da chave exata.
const ALIASES: Record<string, RuleKey> = {
  boas_vindas: "boas_vindas",
  boasvindas: "boas_vindas",
  bem_vindo: "boas_vindas",
  checkin: "checkin_7d",
  check_in: "checkin_7d",
  checkin_7d: "checkin_7d",
  acompanhamento: "checkin_7d",
  pesquisa: "pesquisa",
  nps: "pesquisa",
  satisfacao: "pesquisa",
  pesquisa_de_satisfacao: "pesquisa",
  nota_baixa: "nota_baixa_chamado",
  nota_baixa_chamado: "nota_baixa_chamado",
  nota_alta: "nota_alta_indicacao",
  indicacao: "nota_alta_indicacao",
  nota_alta_indicacao: "nota_alta_indicacao",
  recompra: "recompra",
  comprar_de_novo: "recompra",
  cliente_parado: "cliente_parado",
  parado: "cliente_parado",
  inativo: "cliente_parado",
  em_risco: "cliente_parado",
};

export function ruleKeyFrom(raw: string): RuleKey | null {
  const k = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if ((RULE_KEYS as readonly string[]).includes(k)) return k as RuleKey;
  return ALIASES[k] ?? null;
}

async function loadRows(accountId: string): Promise<Partial<Record<RuleKey, Row>>> {
  const { data, error } = await admin()
    .from("automations")
    .select("id, status, template_key, trigger, graph, version")
    .eq("account_id", accountId)
    .like("template_key", "posvenda:%")
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const out: Partial<Record<RuleKey, Row>> = {};
  for (const a of (data ?? []) as Row[]) {
    const key = ruleKeyOf(a.template_key);
    if (!key) continue;
    const cur = out[key];
    if (!cur || (a.status === "active" && cur.status !== "active")) out[key] = a;
  }
  return out;
}

async function atRiskStage(accountId: string) {
  const { data } = await admin()
    .from("pipeline_stages")
    .select("id, name, pipelines!inner(is_default)")
    .eq("account_id", accountId)
    .eq("pipelines.is_default", true);
  const hit = findStage((data ?? []) as { id: string; name: string }[], AT_RISK_STAGE);
  return hit ? { id: hit.id, name: hit.name } : null;
}

function optionsOf(key: RuleKey, row: Row | undefined) {
  if (!row) {
    const def = ruleDef(key);
    return { message: def.message, days: def.days?.value ?? null };
  }
  return readRuleOptions(key, {
    trigger: row.trigger as unknown as Trigger,
    graph: row.graph as unknown as Graph,
  });
}

interface Change {
  key: RuleKey;
  on?: boolean | undefined;
  message?: string | undefined;
  days?: number | undefined;
}

async function applyChange(caller: Caller, c: Change, row: Row | undefined): Promise<Row> {
  const db = admin();
  const engine = await import("@/features/automations/engine");
  const def = ruleDef(c.key);
  const cur = optionsOf(c.key, row);
  const message = c.message ?? cur.message ?? undefined;
  const days = c.days ?? cur.days ?? undefined;
  const spec = buildRuleAutomation(c.key, {
    ...(message ? { message } : {}),
    ...(days ? { days } : {}),
    atRiskStage: c.key === "cliente_parado" ? await atRiskStage(caller.accountId) : null,
  });
  const content = {
    trigger: spec.trigger as unknown as Json,
    graph: spec.graph as unknown as Json,
  };
  let current = row;
  if (!current) {
    const { data, error } = await db
      .from("automations")
      .insert({
        account_id: caller.accountId,
        created_by: caller.userId,
        name: spec.name,
        description: spec.description,
        kind: spec.kind,
        exit_rules: spec.exit_rules as unknown as Json,
        guards: spec.guards as unknown as Json,
        reentry: spec.reentry,
        template_key: templateKeyFor(c.key),
        status: "draft",
        ...content,
      })
      .select("id, status, template_key, trigger, graph, version")
      .single();
    if (error || !data) throw new Error(`regra ${def.title}: ${error?.message ?? "não criou"}`);
    current = data as Row;
  } else if (c.message !== undefined || c.days !== undefined) {
    const { error } = await db
      .from("automations")
      .update(content)
      .eq("id", current.id)
      .eq("account_id", caller.accountId);
    if (error) throw new Error(`regra ${def.title}: ${error.message}`);
  }
  if (c.on === true && current.status !== "active") {
    const errors = engine.validateGraph(spec.graph);
    if (errors.length) throw new Error(`regra ${def.title}: ${errors.join(" · ")}`);
    const { error } = await db
      .from("automations")
      .update({
        status: "active",
        activated_at: new Date().toISOString(),
        version: current.version + 1,
      })
      .eq("id", current.id)
      .eq("account_id", caller.accountId);
    if (error) throw new Error(`regra ${def.title}: ${error.message}`);
    // quem estava parado junto com a regra volta a andar
    const { data: paused } = await db
      .from("automation_runs")
      .select("id, step_seq")
      .eq("automation_id", current.id)
      .eq("status", "paused");
    if (paused?.length) {
      const rt = await import("@/backend/automations/runtime.server");
      for (const r of paused) {
        await db
          .from("automation_runs")
          .update({ status: "running" })
          .eq("id", r.id)
          .eq("account_id", caller.accountId);
        await rt.scheduleStep(caller.accountId, r.id, r.step_seq, new Date());
      }
    }
    if (spec.trigger.type === "inactive")
      await db.rpc("enqueue_job", {
        _account: caller.accountId,
        _kind: "automation.scan",
        _payload: {},
        _dedupe: "automation.scan",
      });
    current = { ...current, status: "active" };
  }
  if (c.on === false && current.status === "active") {
    await db
      .from("automations")
      .update({ status: "paused" })
      .eq("id", current.id)
      .eq("account_id", caller.accountId);
    await db
      .from("automation_runs")
      .update({ status: "paused" })
      .eq("automation_id", current.id)
      .in("status", ["running", "waiting"]);
    current = { ...current, status: "paused" };
  }
  return current;
}

/** Estado das regras em texto para a IA e em cartões para a tela. */
async function describe(accountId: string) {
  const db = admin();
  const [rows, acc] = await Promise.all([
    loadRows(accountId),
    db.from("accounts").select("settings").eq("id", accountId).single(),
  ]);
  const cap = dailyCapOf(acc.data?.settings);
  const lines = RULES.map((def) => {
    const row = rows[def.key];
    const on = row?.status === "active";
    const o = optionsOf(def.key, row);
    return {
      key: def.key,
      title: def.title,
      on,
      when: whenText(def, o.days),
      message: o.message,
    };
  });
  return { lines, cap, rows };
}

export const RULES_RUNNERS: Record<string, Runner> = {
  async ver_regras(ctx) {
    const d = await describe(ctx.caller.accountId);
    return {
      content: [
        ...d.lines.map(
          (l) =>
            `- ${l.title} (${l.key}): ${l.on ? "LIGADA" : "desligada"}. ${l.when}${l.message ? ` Mensagem: "${l.message}"` : " (não manda mensagem ao cliente)"}`,
        ),
        `Teto de envios por dia: ${d.cap === 0 ? "sem teto" : d.cap}.`,
      ].join("\n"),
      block: {
        kind: "steps",
        title: "Regras de pós-venda",
        hint: `Teto de envios por dia: ${d.cap === 0 ? "sem teto" : d.cap}`,
        steps: d.lines.map((l) => ({
          label: `${l.title}: ${l.on ? "ligada" : "desligada"}`,
          state: l.on ? ("feito" as const) : ("depois" as const),
        })),
      },
    };
  },

  async configurar_regras(ctx, a) {
    const db = admin();
    const all = s(a["todas"], 12).toLowerCase();
    const cap =
      a["teto_diario"] === undefined || a["teto_diario"] === ""
        ? null
        : intArg(a["teto_diario"], 0, MAX_DAILY_CAP);
    const changes = new Map<RuleKey, Change>();
    if (all === "ligar" || all === "desligar")
      for (const k of RULE_KEYS) changes.set(k, { key: k, on: all === "ligar" });
    else if (all) throw new Error('em "todas" use ligar ou desligar');
    const unknown: string[] = [];
    for (const raw of listArg(a["regras"])) {
      const key = ruleKeyFrom(s(raw["regra"], 60));
      if (!key) {
        unknown.push(s(raw["regra"], 60) || "(sem nome)");
        continue;
      }
      const def = ruleDef(key);
      const days =
        raw["dias"] === undefined || raw["dias"] === "" ? null : intArg(raw["dias"], 1, 365);
      const message = s(raw["mensagem"], 1000);
      if (message && def.message === null)
        throw new Error(
          `a regra ${def.title} não manda mensagem ao cliente: não tem texto para mudar`,
        );
      if (days !== null && !def.days)
        throw new Error(`a regra ${def.title} não tem prazo em dias: dispara na hora`);
      if (days !== null && def.days && (days < def.days.min || days > def.days.max))
        throw new Error(
          `o prazo da regra ${def.title} vai de ${def.days.min} a ${def.days.max} dias`,
        );
      const prev = changes.get(key);
      changes.set(key, {
        key,
        on: boolArg(raw["ligada"]) ?? prev?.on,
        ...(message ? { message } : {}),
        ...(days !== null ? { days } : {}),
      });
    }
    if (unknown.length)
      throw new Error(
        `regra desconhecida: ${unknown.join(", ")}. As regras são: ${RULES.map((r) => `${r.key} (${r.title})`).join(", ")}`,
      );
    if (!changes.size && cap === null)
      throw new Error("diga qual regra mudar (ligar, desligar, mensagem ou dias) ou o teto diário");

    const rows = await loadRows(ctx.caller.accountId);
    // regra que depende de outra: ligar "nota baixa" ou "nota alta" liga a pesquisa junto
    for (const c of [...changes.values()]) {
      const needs = ruleDef(c.key).needs;
      if (
        c.on === true &&
        needs &&
        rows[needs]?.status !== "active" &&
        changes.get(needs)?.on !== true
      )
        changes.set(needs, { ...(changes.get(needs) ?? { key: needs }), on: true });
    }
    const done: string[] = [];
    const failed: string[] = [];
    for (const c of changes.values()) {
      const def = ruleDef(c.key);
      try {
        rows[c.key] = await applyChange(ctx.caller, c, rows[c.key]);
        const bits = [
          c.on === true ? "ligada" : c.on === false ? "desligada" : "",
          c.days !== undefined ? `${c.days} dias` : "",
          c.message !== undefined ? "mensagem nova" : "",
        ].filter(Boolean);
        done.push(`${def.title}: ${bits.join(", ") || "sem mudança"}`);
      } catch (err) {
        failed.push(err instanceof Error ? err.message : String(err));
      }
    }
    // o resumo no settings reflete o estado real de TODAS as regras (contrato com o passo a passo)
    const { data: acc } = await db
      .from("accounts")
      .select("settings")
      .eq("id", ctx.caller.accountId)
      .single();
    let settings = (acc?.settings ?? {}) as Record<string, unknown>;
    for (const k of RULE_KEYS) settings = withRuleFlag(settings, k, rows[k]?.status === "active");
    if (cap !== null) {
      settings = withDailyCap(settings, cap);
      done.push(`teto de envios por dia: ${cap === 0 ? "sem teto" : cap}`);
    }
    const { error } = await db
      .from("accounts")
      .update({ settings: settings as Json })
      .eq("id", ctx.caller.accountId);
    if (error) throw new Error(error.message);

    const onNow = RULE_KEYS.filter((k) => rows[k]?.status === "active").map(
      (k) => ruleDef(k).title,
    );
    const { count: wa } = await db
      .from("channels")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", ctx.caller.accountId)
      .eq("platform", "whatsapp")
      .eq("status", "connected");
    if (!done.length) throw new Error(failed.join("; "));
    return {
      content: [
        `Feito: ${done.join("; ")}.`,
        failed.length ? `Não deu: ${failed.join("; ")}.` : "",
        `Ligadas agora: ${onNow.join(", ") || "nenhuma"}.`,
        onNow.length && !wa
          ? "ATENÇÃO: sem WhatsApp conectado as regras ficam ligadas, mas nenhuma mensagem sai. Ofereça conectar."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      action: {
        kind: failed.length ? "error" : "done",
        label: (failed.length ? `Parte não deu: ${failed[0]}` : done.join("; ")).slice(0, 160),
        tool: "configurar_regras",
      },
      block: {
        kind: "steps",
        title: "Regras de pós-venda",
        steps: RULES.map((def) => ({
          label: `${def.title}: ${rows[def.key]?.status === "active" ? "ligada" : "desligada"}`,
          state: rows[def.key]?.status === "active" ? ("feito" as const) : ("depois" as const),
        })),
      },
    };
  },
};
