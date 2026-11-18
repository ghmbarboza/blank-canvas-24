import { describe, expect, it } from "vitest";

import {
  nodeConfigErrors,
  DEFAULT_EXIT,
  EMPTY_FACTS,
  abBranch,
  checkExit,
  inQuietHours,
  isStaleStep,
  nextAllowedTime,
  planStep,
  triggerMatches,
  validateGraph,
  type AutoNode,
  type Graph,
  type StepContext,
} from "./engine";

const TZ = "America/Sao_Paulo";
// 2026-10-21 é quarta-feira; 14:00 em São Paulo = 17:00 UTC.
const WED_14H = new Date("2026-10-21T17:00:00Z");

function ctx(over: Partial<StepContext> = {}): StepContext {
  return {
    now: WED_14H,
    tz: TZ,
    runId: "run-1",
    guards: {
      weekly_cap: 3,
      business_hours: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] },
      respect_consent: true,
    },
    facts: EMPTY_FACTS,
    sentThisWeek: 0,
    consent: () => true,
    runContext: {},
    ...over,
  };
}

const email: AutoNode = {
  id: "a",
  type: "email",
  config: { subject: "Oi", body: "Olá" },
  next: "b",
};

describe("validação do grafo", () => {
  it("aceita um fluxo simples e acusa ramo faltando, referência quebrada e solto", () => {
    const ok: Graph = { start: "a", nodes: { a: email, b: { id: "b", type: "end", config: {} } } };
    expect(validateGraph(ok)).toEqual([]);
    const bad: Graph = {
      start: "a",
      nodes: {
        a: { id: "a", type: "condition", config: { kind: "opened" }, yes: "x" },
        z: { id: "z", type: "end", config: {} },
      },
    };
    const errs = validateGraph(bad).join(" | ");
    expect(errs).toContain("precisa dos dois caminhos");
    expect(errs).toContain("não existe");
    expect(errs).toContain("solto");
  });
  it("recusa ciclo sem espera e aceita ciclo com espera", () => {
    const loop: Graph = {
      start: "a",
      nodes: {
        a: { ...email, next: "b" },
        b: { id: "b", type: "add_tag", config: { tag: "x" }, next: "a" },
      },
    };
    expect(validateGraph(loop).join()).toContain("laço infinito");
    const withWait: Graph = {
      start: "a",
      nodes: {
        a: { ...email, next: "w" },
        w: { id: "w", type: "wait", config: { minutes: 60 }, next: "a" },
      },
    };
    expect(validateGraph(withWait).join()).not.toContain("laço infinito");
  });
});

describe("planejamento do passo", () => {
  it("envio avança para o próximo e gera a ação no canal", () => {
    const p = planStep(email, ctx());
    expect(p.status).toBe("advance");
    expect(p.next).toBe("b");
    expect(p.action).toMatchObject({ kind: "send", channel: "email" });
  });
  it("espera agenda o próximo passo no futuro", () => {
    const p = planStep({ id: "w", type: "wait", config: { minutes: 120 }, next: "b" }, ctx());
    expect(p.status).toBe("wait");
    expect(p.at.getTime() - WED_14H.getTime()).toBe(120 * 60_000);
  });
  it("condição escolhe o ramo pelo fato", () => {
    const node: AutoNode = {
      id: "c",
      type: "condition",
      config: { kind: "score_gte", value: 60 },
      yes: "y",
      no: "n",
    };
    expect(planStep(node, ctx({ facts: { ...EMPTY_FACTS, score: 70 } })).next).toBe("y");
    expect(planStep(node, ctx({ facts: { ...EMPTY_FACTS, score: 10 } })).next).toBe("n");
  });
  it("esperar evento: começa aguardando, segue no sim se aconteceu, no não se o prazo venceu", () => {
    const node: AutoNode = {
      id: "e",
      type: "wait_event",
      config: { event: "replied", timeout_minutes: 60 },
      yes: "y",
      no: "n",
    };
    const first = planStep(node, ctx());
    expect(first.status).toBe("wait");
    expect(first.contextPatch["wait_e"]).toBe(WED_14H.toISOString());
    const replied = planStep(
      node,
      ctx({
        runContext: first.contextPatch,
        facts: { ...EMPTY_FACTS, replied_since_enroll: true },
      }),
    );
    expect(replied.next).toBe("y");
    const late = planStep(
      node,
      ctx({ runContext: first.contextPatch, now: new Date(WED_14H.getTime() + 61 * 60_000) }),
    );
    expect(late.next).toBe("n");
  });
});

describe("guardas", () => {
  it("sem consentimento ou acima do teto semanal, o envio é pulado e o fluxo segue", () => {
    const noConsent = planStep(email, ctx({ consent: () => false }));
    expect(noConsent.action).toBeNull();
    expect(noConsent.log.status).toBe("skipped");
    expect(noConsent.next).toBe("b");
    const capped = planStep(email, ctx({ sentThisWeek: 3 }));
    expect(capped.action).toBeNull();
    expect(capped.log.message).toContain("teto");
  });
  it("fora do horário comercial reagenda para a próxima abertura no fuso da conta", () => {
    const saturday = new Date("2026-10-24T15:00:00Z"); // sábado 12:00 em SP
    const p = planStep(email, ctx({ now: saturday }));
    expect(p.status).toBe("wait");
    expect(p.next).toBe("a");
    expect(p.at.toISOString()).toBe("2026-10-26T11:00:00.000Z"); // segunda 08:00 em SP
  });
  it("dentro da janela não mexe no horário; à noite empurra para o dia seguinte", () => {
    const bh = { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] };
    expect(nextAllowedTime(WED_14H, TZ, bh).getTime()).toBe(WED_14H.getTime());
    const wedNight = new Date("2026-10-22T00:30:00Z"); // quarta 21:30 em SP
    expect(nextAllowedTime(wedNight, TZ, bh).toISOString()).toBe("2026-10-22T11:00:00.000Z");
  });
  it("horário silencioso que atravessa a meia-noite", () => {
    expect(inQuietHours(new Date("2026-10-22T02:00:00Z"), TZ, "21:00", "08:00")).toBe(true); // 23h SP
    expect(inQuietHours(WED_14H, TZ, "21:00", "08:00")).toBe(false);
  });
});

describe("saída e idempotência", () => {
  it("sai quando responde, agenda ou vira cliente, conforme as regras", () => {
    expect(checkExit(DEFAULT_EXIT, { ...EMPTY_FACTS, replied_since_enroll: true })).toBe("replied");
    expect(checkExit(DEFAULT_EXIT, { ...EMPTY_FACTS, customer: true })).toBe("customer");
    expect(
      checkExit(
        { ...DEFAULT_EXIT, on_reply: false },
        { ...EMPTY_FACTS, replied_since_enroll: true },
      ),
    ).toBeNull();
    expect(checkExit(DEFAULT_EXIT, { ...EMPTY_FACTS, deal_lost: true })).toBeNull();
  });
  it("job velho (step_seq diferente) ou inscrição encerrada não executa de novo", () => {
    expect(isStaleStep(3, 3, "running")).toBe(false);
    expect(isStaleStep(2, 3, "running")).toBe(true);
    expect(isStaleStep(3, 3, "exited")).toBe(true);
  });
  it("teste A/B é estável para o mesmo contato e respeita o percentual", () => {
    expect(abBranch("r1", "n1", 50)).toBe(abBranch("r1", "n1", 50));
    expect(abBranch("r1", "n1", 100)).toBe("yes");
    expect(abBranch("r1", "n1", 0)).toBe("no");
    const a = Array.from({ length: 1000 }, (_, i) => abBranch(`r${i}`, "n", 30)).filter(
      (x) => x === "yes",
    ).length;
    expect(a).toBeGreaterThan(220);
    expect(a).toBeLessThan(380);
  });
  it("gatilho de evento respeita o filtro de formulário", () => {
    const t = { type: "event" as const, event: "form.submitted", filters: { form_id: "f1" } };
    expect(triggerMatches(t, { type: "form.submitted", payload: { form_id: "f1" } })).toBe(true);
    expect(triggerMatches(t, { type: "form.submitted", payload: { form_id: "f2" } })).toBe(false);
  });
});

describe("nós da equipe de IA e dos apps conectados", () => {
  it("chamar agente vira ação com a configuração e segue", () => {
    const p = planStep(
      { id: "a", type: "ai_agent", config: { agent_id: "x", goal: "retomar" }, next: "b" },
      ctx(),
    );
    expect(p.action).toEqual({ kind: "ai_agent", config: { agent_id: "x", goal: "retomar" } });
    expect(p.next).toBe("b");
  });
  it("ação num app vira ação composio", () => {
    const p = planStep(
      { id: "c", type: "composio_action", config: { tool_slug: "SLACK_CHAT_POST_MESSAGE" } },
      ctx(),
    );
    expect(p.action?.kind).toBe("composio");
    expect(p.status).toBe("done");
  });
  it("cobra agente e ação escolhidos", () => {
    expect(nodeConfigErrors({ id: "a", type: "ai_agent", config: {} })).toHaveLength(1);
    expect(
      nodeConfigErrors({ id: "c", type: "composio_action", config: { tool_slug: "x" } }),
    ).toHaveLength(1);
    expect(
      nodeConfigErrors({
        id: "c",
        type: "composio_action",
        config: { tool_slug: "GMAIL_SEND_EMAIL" },
      }),
    ).toEqual([]);
  });
});
