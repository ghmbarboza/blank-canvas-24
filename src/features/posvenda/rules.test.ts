import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EMPTY_FACTS,
  DEFAULT_GUARDS,
  planStep,
  startOfDay,
  startOfNextDay,
  triggerMatches,
  validateGraph,
  type StepContext,
} from "@/features/automations/engine";
import { isModuleOn } from "@/backend/modules-logic";

import { rowsByRule, type RuleRow } from "./api";
import {
  POS_VENDA_DEFAULT_MODULES,
  POS_VENDA_PIPELINE,
  POS_VENDA_STAGES,
  findStage,
} from "./journey";
import { DEFAULT_PRAZOS, fillReviewLink } from "./moment";
import {
  DEFAULT_DAILY_CAP,
  PURCHASE_FIELD,
  RULES,
  RULE_KEYS,
  buildRuleAutomation,
  dailyCapOf,
  readRuleOptions,
  ruleFlags,
  ruleKeyOf,
  templateKeyFor,
  whenText,
  withDailyCap,
  withRuleFlag,
} from "./rules";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261118120000_edicao_pos_venda.sql"),
  "utf8",
);

describe("regras de pós-venda → automação", () => {
  it("as sete chaves do contrato com o onboarding, nessa ordem, e as duas de prazo depois", () => {
    expect([...RULE_KEYS].slice(0, 7)).toEqual([
      "boas_vindas",
      "checkin_7d",
      "pesquisa",
      "nota_baixa_chamado",
      "nota_alta_indicacao",
      "recompra",
      "cliente_parado",
    ]);
    expect([...RULE_KEYS].slice(7)).toEqual(["fim_arrependimento", "fim_garantia"]);
    expect(RULES.map((r) => r.key)).toEqual([...RULE_KEYS]);
  });

  it.each(RULE_KEYS)("%s vira um grafo válido no motor, achado pelo template_key", (key) => {
    const a = buildRuleAutomation(key, { atRiskStage: { id: "s1", name: "Em risco" } });
    expect(validateGraph(a.graph)).toEqual([]);
    expect(a.template_key).toBe(templateKeyFor(key));
    expect(ruleKeyOf(a.template_key)).toBe(key);
    // quem está na regra já é cliente e pode responder: nada disso tira da regra
    expect(a.exit_rules.on_customer).toBe(false);
    expect(a.exit_rules.on_reply).toBe(false);
    expect(a.exit_rules.on_unsubscribe).toBe(true);
    expect(a.guards.respect_consent).toBe(true);
  });

  it("nenhum texto usa travessão nem o nome antigo do produto", () => {
    for (const r of RULES) {
      const all = `${r.title} ${r.what} ${r.when} ${r.message ?? ""}`;
      expect(all).not.toContain("—");
      expect(all).not.toMatch(/nexus|nexa/i);
    }
  });

  it("gatilhos: cliente novo, resposta da pesquisa por nota e cliente parado", () => {
    for (const k of ["boas_vindas", "checkin_7d", "pesquisa", "recompra"] as const)
      expect(buildRuleAutomation(k).trigger).toEqual({ type: "event", event: "customer.new" });
    expect(buildRuleAutomation("nota_baixa_chamado").trigger).toEqual({
      type: "event",
      event: "nps.answered",
      filters: { score_max: 6 },
    });
    expect(buildRuleAutomation("nota_alta_indicacao").trigger.filters).toEqual({ score_min: 9 });
    expect(buildRuleAutomation("cliente_parado", { days: 45 }).trigger).toEqual({
      type: "inactive",
      days: 45,
    });
  });

  it("prazo editável vira a espera; fora da faixa volta para o limite", () => {
    expect(buildRuleAutomation("recompra").graph.nodes["wait"]?.config["minutes"]).toBe(30 * 1440);
    expect(
      buildRuleAutomation("recompra", { days: 90 }).graph.nodes["wait"]?.config["minutes"],
    ).toBe(90 * 1440);
    expect(buildRuleAutomation("checkin_7d").graph.nodes["wait"]?.config["minutes"]).toBe(7 * 1440);
    expect(
      buildRuleAutomation("recompra", { days: 9999 }).graph.nodes["wait"]?.config["minutes"],
    ).toBe(365 * 1440);
    expect(
      buildRuleAutomation("recompra", { days: -3 }).graph.nodes["wait"]?.config["minutes"],
    ).toBe(30 * 1440);
  });

  it("mensagem editada vai para o nó; vazia volta ao texto padrão; a pesquisa leva o link", () => {
    const a = buildRuleAutomation("boas_vindas", { message: "  Olá {{primeiro_nome}}  " });
    expect(a.graph.nodes["msg"]?.config["text"]).toBe("Olá {{primeiro_nome}}");
    expect(
      buildRuleAutomation("boas_vindas", { message: " " }).graph.nodes["msg"]?.config["text"],
    ).toBe(RULES[0]!.message);
    const p = buildRuleAutomation("pesquisa");
    expect(p.graph.nodes["msg"]?.config["survey"]).toBe("nps");
    expect(String(p.graph.nodes["msg"]?.config["text"])).toContain("{{link_pesquisa}}");
  });

  it("nota baixa abre chamado e avisa; cliente parado etiqueta, move (se há etapa) e cria tarefa", () => {
    const low = buildRuleAutomation("nota_baixa_chamado").graph;
    expect(low.start).toBe("ticket");
    expect(low.nodes["ticket"]?.type).toBe("ticket");
    expect(low.nodes["ticket"]?.next).toBe("notify");
    const withStage = buildRuleAutomation("cliente_parado", {
      atRiskStage: { id: "s1", name: "Em risco" },
    }).graph;
    expect(withStage.nodes["tag"]?.next).toBe("stage");
    expect(withStage.nodes["stage"]?.config["stage_id"]).toBe("s1");
    const noStage = buildRuleAutomation("cliente_parado").graph;
    expect(noStage.nodes["stage"]).toBeUndefined();
    expect(noStage.nodes["tag"]?.next).toBe("task");
    expect(validateGraph(noStage)).toEqual([]);
  });

  it("lê de volta o que foi salvo", () => {
    const a = buildRuleAutomation("recompra", { days: 45, message: "Volte sempre" });
    expect(readRuleOptions("recompra", a)).toEqual({ message: "Volte sempre", days: 45 });
    expect(
      readRuleOptions("cliente_parado", buildRuleAutomation("cliente_parado", { days: 20 })),
    ).toEqual({ message: null, days: 20 });
    expect(readRuleOptions("boas_vindas", buildRuleAutomation("boas_vindas")).days).toBeNull();
    expect(whenText(RULES[5]!, 45)).toBe("45 dias depois que o contato vira cliente.");
  });

  it("escolhe a automação ligada quando há mais de uma da mesma regra", () => {
    const row = (id: string, status: string, key = "posvenda:boas_vindas") =>
      ({ id, status, template_key: key }) as unknown as RuleRow;
    const by = rowsByRule([row("a", "paused"), row("b", "active"), row("c", "active", "outro")]);
    expect(by.boas_vindas?.id).toBe("b");
    expect(Object.keys(by)).toEqual(["boas_vindas"]);
  });
});

describe("estado em accounts.settings.posvenda", () => {
  it("grava a regra sem perder o resto do settings", () => {
    const s = withRuleFlag(
      { modules: ["gestao"], posvenda: { daily_cap: 20, rules: { pesquisa: true } } },
      "boas_vindas",
      true,
    );
    expect(s).toEqual({
      modules: ["gestao"],
      posvenda: { daily_cap: 20, rules: { pesquisa: true, boas_vindas: true } },
    });
    expect(ruleFlags(s)).toEqual({ boas_vindas: true, pesquisa: true });
    expect(ruleFlags(withRuleFlag(s, "pesquisa", false))).toEqual({ boas_vindas: true });
    expect(ruleFlags(null)).toEqual({});
    expect(ruleFlags({ posvenda: { rules: { boas_vindas: "sim", intrusa: true } } })).toEqual({});
  });

  it("teto do dia: 40 por padrão, 0 tira o teto, lixo cai no padrão", () => {
    expect(dailyCapOf({})).toBe(DEFAULT_DAILY_CAP);
    expect(dailyCapOf(null)).toBe(40);
    expect(dailyCapOf({ posvenda: { daily_cap: 0 } })).toBe(0);
    expect(dailyCapOf({ posvenda: { daily_cap: "80" } })).toBe(40);
    expect(dailyCapOf(withDailyCap({ modules: [] }, 120))).toBe(120);
    expect(dailyCapOf(withDailyCap({}, 99999))).toBe(500);
  });
});

describe("motor: o que a edição de pós-venda acrescentou", () => {
  const ctx = (over: Partial<StepContext> = {}): StepContext => ({
    now: new Date("2026-11-18T15:00:00Z"), // quarta, 12h em São Paulo
    tz: "America/Sao_Paulo",
    runId: "r1",
    guards: DEFAULT_GUARDS,
    facts: EMPTY_FACTS,
    sentThisWeek: 0,
    consent: () => true,
    runContext: {},
    ...over,
  });
  const msg = buildRuleAutomation("boas_vindas").graph.nodes["msg"]!;

  it("abaixo do teto do dia a mensagem sai", () => {
    expect(planStep(msg, ctx({ dailyCap: 40, sentToday: 39 })).action?.kind).toBe("send");
    expect(planStep(msg, ctx({ dailyCap: 0, sentToday: 999 })).action?.kind).toBe("send");
    expect(planStep(msg, ctx()).action?.kind).toBe("send");
  });

  it("no teto a mensagem não se perde: fica para o dia seguinte, no horário comercial", () => {
    const p = planStep(msg, ctx({ dailyCap: 40, sentToday: 40 }));
    expect(p.action).toBeNull();
    expect(p.status).toBe("wait");
    expect(p.next).toBe("msg");
    expect(p.log.status).toBe("deferred");
    expect(p.at.toISOString()).toBe("2026-11-19T11:00:00.000Z"); // quinta, 8h em São Paulo
  });

  it("dia no fuso da conta", () => {
    const now = new Date("2026-11-19T01:30:00Z"); // ainda quarta, 22h30 em São Paulo
    expect(startOfDay(now, "America/Sao_Paulo").toISOString()).toBe("2026-11-18T03:00:00.000Z");
    expect(startOfNextDay(now, "America/Sao_Paulo").toISOString()).toBe("2026-11-19T03:00:00.000Z");
  });

  it("gatilho por nota: só entra quem está na faixa", () => {
    const low = buildRuleAutomation("nota_baixa_chamado").trigger;
    const high = buildRuleAutomation("nota_alta_indicacao").trigger;
    const ev = (score: unknown) => ({ type: "nps.answered", payload: { contact_id: "c", score } });
    expect(triggerMatches(low, ev(0))).toBe(true);
    expect(triggerMatches(low, ev(6))).toBe(true);
    expect(triggerMatches(low, ev(7))).toBe(false);
    expect(triggerMatches(high, ev(9))).toBe(true);
    expect(triggerMatches(high, ev(8))).toBe(false);
    expect(triggerMatches(low, ev(null))).toBe(false);
    expect(triggerMatches(low, ev(undefined))).toBe(false);
    expect(triggerMatches(low, { type: "customer.new", payload: { score: 1 } })).toBe(false);
  });

  it("o passo de chamado planeja a ação e exige assunto", () => {
    const t = buildRuleAutomation("nota_baixa_chamado").graph.nodes["ticket"]!;
    expect(planStep(t, ctx()).action).toEqual({ kind: "ticket", config: t.config });
    expect(
      validateGraph({ start: "t", nodes: { t: { id: "t", type: "ticket", config: {} } } }),
    ).toEqual(["Abrir chamado: falta o assunto"]);
  });
});

describe("conta nova de pós-venda (migration x código)", () => {
  it("a migration cria o funil e as etapas iguais às do código, na mesma ordem", () => {
    expect(MIGRATION).toContain(`'${POS_VENDA_PIPELINE}', true, 0`);
    let last = -1;
    POS_VENDA_STAGES.forEach((s, i) => {
      const line = `(_account, _pipeline, '${s.name}', ${i}, '${s.color}', ${s.probability}, '${s.kind}')`;
      const at = MIGRATION.indexOf(line);
      expect(at, line).toBeGreaterThan(last);
      last = at;
    });
    expect(MIGRATION).not.toMatch(/'Vendas'|Novo lead/);
  });

  it("só Perdido fecha o cartão; as demais ficam abertas", () => {
    expect(POS_VENDA_STAGES.filter((s) => s.kind !== "open").map((s) => s.name)).toEqual([
      "Perdido",
    ]);
    expect(findStage(POS_VENDA_STAGES, " em RISCO ")?.name).toBe("Em risco");
    expect(findStage(POS_VENDA_STAGES, "Negociação")).toBeNull();
  });

  it("a migration liga os mesmos recursos que o código espera e a pesquisa ao fechar conversa", () => {
    const list = POS_VENDA_DEFAULT_MODULES.map((m) => `'${m}'`).join(", ");
    expect(MIGRATION).toContain(`'modules', jsonb_build_array(${list})`);
    expect(MIGRATION).toContain("'csat_on_close', true");
    const settings = { modules: [...POS_VENDA_DEFAULT_MODULES], csat_on_close: true };
    for (const m of POS_VENDA_DEFAULT_MODULES) expect(isModuleOn(settings, m)).toBe(true);
    for (const off of ["metas", "treino", "campanhas", "empresas", "captacao"] as const)
      expect(isModuleOn(settings, off)).toBe(false);
  });

  it("a migration emite os dois avisos que as regras escutam e não deixa função aberta", () => {
    expect(MIGRATION).toContain("'customer.new'");
    expect(MIGRATION).toContain("'nps.answered'");
    expect(MIGRATION).toContain("not like 'import%'");
    const created = [...MIGRATION.matchAll(/create or replace function public\.(\w+)\(/g)].map(
      (m) => m[1]!,
    );
    expect(created.sort()).toEqual([
      "create_account_for",
      "tg_agent_nps_answered",
      "tg_nps_answered",
      "tg_posvenda_customer_new",
    ]);
    for (const fn of created)
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`,
        ),
      );
    // nenhum UPDATE ou DELETE sem WHERE
    for (const stmt of MIGRATION.split(";").filter((x) => /^\s*(update|delete)\s/im.test(x)))
      expect(stmt).toMatch(/\swhere\s/i);
  });
});

describe("regras contadas da data da compra", () => {
  it("fim do arrependimento fala um dia antes de o prazo vencer", () => {
    const a = buildRuleAutomation("fim_arrependimento");
    // prazo padrão de 7 dias: a mensagem sai 6 dias depois da compra (gatilho por data, dias negativos)
    expect(a.trigger).toEqual({ type: "date", field: PURCHASE_FIELD, days_before: -6 });
    expect(PURCHASE_FIELD).toBe("custom.ultima_compra");
    expect(validateGraph(a.graph)).toEqual([]);
    expect(a.graph.start).toBe("msg");
    expect(a.graph.nodes["msg"]?.type).toBe("whatsapp");
    // a espera segura a inscrição até o dia passar: a varredura não inscreve duas vezes na mesma data
    expect(a.graph.nodes["msg"]?.next).toBe("hold");
    expect(Number(a.graph.nodes["hold"]?.config["minutes"])).toBeGreaterThanOrEqual(1440);
    // nova compra (nova data) entra de novo
    expect(a.reentry).toBe("after_exit");
  });

  it("fim do arrependimento segue o prazo da conta", () => {
    const p = { ...DEFAULT_PRAZOS, arrependimento_dias: 15 };
    expect(buildRuleAutomation("fim_arrependimento", { prazos: p }).trigger.days_before).toBe(-14);
    // prazo de 1 dia: fala no próprio dia da compra, sem "menos zero"
    const one = buildRuleAutomation("fim_arrependimento", {
      prazos: { ...DEFAULT_PRAZOS, arrependimento_dias: 1 },
    });
    expect(Object.is(one.trigger.days_before, 0)).toBe(true);
  });

  it("fim da garantia avisa N dias antes, com a garantia da conta", () => {
    const def = buildRuleAutomation("fim_garantia");
    // garantia de 90 dias, aviso 7 dias antes: 83 dias depois da compra
    expect(def.trigger).toEqual({ type: "date", field: PURCHASE_FIELD, days_before: -83 });
    expect(validateGraph(def.graph)).toEqual([]);
    expect(String(def.graph.nodes["msg"]?.config["text"])).toContain("{{fim_garantia}}");

    const custom = buildRuleAutomation("fim_garantia", {
      days: 15,
      prazos: { ...DEFAULT_PRAZOS, garantia_dias: 365 },
    });
    expect(custom.trigger.days_before).toBe(-350);
    // o aviso lido de volta é o que o dono escolheu, não a conta do gatilho
    expect(readRuleOptions("fim_garantia", custom).days).toBe(15);
    expect(
      whenText(
        RULES.find((r) => r.key === "fim_garantia")!,
        15,
      ),
    ).toBe("15 dias antes de a garantia vencer, contados da data da compra.");
  });

  it("o aviso da garantia nunca cai antes da compra", () => {
    const short = buildRuleAutomation("fim_garantia", {
      days: 30,
      prazos: { ...DEFAULT_PRAZOS, garantia_dias: 10 },
    });
    // garantia de 10 dias com aviso de 30: avisa 1 dia depois da compra
    expect(short.trigger.days_before).toBe(-1);
  });

  it("mensagem editada volta igual e o prazo de dias só existe em fim_garantia", () => {
    const a = buildRuleAutomation("fim_arrependimento", { message: "Tudo certo com o pedido?" });
    expect(readRuleOptions("fim_arrependimento", a)).toEqual({
      message: "Tudo certo com o pedido?",
      days: null,
    });
    expect(RULES.find((r) => r.key === "fim_arrependimento")!.days).toBeNull();
  });

  it("as duas regras novas entram no resumo do settings sem mexer nas sete", () => {
    let s: Record<string, unknown> = { posvenda: { rules: { boas_vindas: true } } };
    s = withRuleFlag(s, "fim_garantia", true);
    expect(ruleFlags(s)).toEqual({ boas_vindas: true, fim_garantia: true });
  });

  it("nota alta leva o link do Google quando existe e sai limpa quando não existe", () => {
    const text = String(
      buildRuleAutomation("nota_alta_indicacao").graph.nodes["msg"]?.config["text"],
    );
    expect(text).toContain("{{link_avaliacao}}");
    expect(fillReviewLink(text, "https://g.page/r/abc/review")).toMatch(
      /ajuda muito\. https:\/\/g\.page\/r\/abc\/review$/,
    );
    const semLink = fillReviewLink(text, "");
    expect(semLink).not.toContain("link_avaliacao");
    expect(semLink.endsWith("ajuda muito.")).toBe(true);
    // quem escreveu a mensagem sem a variável não muda
    expect(fillReviewLink("Obrigado pela nota!", "https://g.page/x")).toBe("Obrigado pela nota!");
  });
});
