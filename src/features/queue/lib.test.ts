import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPACITY,
  DEFAULT_DIALING,
  agentLoad,
  anyRuleOn,
  applyDialPrefix,
  attendedTransferCode,
  capacityClassOf,
  checkDialingRules,
  chunk,
  deriveAgentState,
  fitsCapacity,
  formatSeconds,
  matchQueue,
  normalizeSkill,
  parseDialingRules,
  parseDncFile,
  rankReason,
  rankWorkItems,
  superviseSteps,
} from "./lib";

const NOW = new Date("2026-10-27T15:00:00Z");
const iso = (secondsFromNow: number) =>
  new Date(NOW.getTime() + secondsFromNow * 1000).toISOString();

describe("capacidade por canal", () => {
  it("1 ligação ocupa o atendente inteiro", () => {
    const load = agentLoad(DEFAULT_CAPACITY, ["voice"]);
    expect(load).toBe(1);
    expect(fitsCapacity(DEFAULT_CAPACITY, load, "chat")).toBe(false);
    expect(fitsCapacity(DEFAULT_CAPACITY, load, "voice")).toBe(false);
  });

  it("aceita até 4 chats e recusa o quinto", () => {
    const four = agentLoad(DEFAULT_CAPACITY, ["chat", "chat", "chat"]);
    expect(fitsCapacity(DEFAULT_CAPACITY, four, "chat")).toBe(true);
    const full = agentLoad(DEFAULT_CAPACITY, ["chat", "chat", "chat", "chat"]);
    expect(fitsCapacity(DEFAULT_CAPACITY, full, "chat")).toBe(false);
  });

  it("mistura canais: 2 chats + 3 e-mails ainda cabe, ligação não", () => {
    const load = agentLoad(DEFAULT_CAPACITY, ["chat", "chat", "email", "email", "email"]);
    expect(load).toBeCloseTo(1, 5);
    expect(fitsCapacity(DEFAULT_CAPACITY, load, "email")).toBe(false);
    const lighter = agentLoad(DEFAULT_CAPACITY, ["chat", "email"]);
    expect(fitsCapacity(DEFAULT_CAPACITY, lighter, "voice")).toBe(false);
    expect(fitsCapacity(DEFAULT_CAPACITY, lighter, "chat")).toBe(true);
  });

  it("capacidade zero bloqueia o canal", () => {
    expect(fitsCapacity({ ...DEFAULT_CAPACITY, cap_voice: 0 }, 0, "voice")).toBe(false);
  });

  it("classifica o canal", () => {
    expect(capacityClassOf("whatsapp_call")).toBe("voice");
    expect(capacityClassOf("whatsapp")).toBe("chat");
    expect(capacityClassOf("email")).toBe("email");
    expect(capacityClassOf("ticket")).toBe("task");
  });
});

describe("ordem da fila", () => {
  const base = { priority: 50, customer_value: 0, sla_due_at: null as string | null };

  it("SLA a estourar vem antes do cliente de maior valor", () => {
    const items = [
      { ...base, id: "vip", customer_value: 50000, created_at: iso(-600) },
      { ...base, id: "sla", sla_due_at: iso(30), created_at: iso(-10) },
    ];
    expect(rankWorkItems(items, NOW).map((i) => i.id)).toEqual(["sla", "vip"]);
  });

  it("entre os em risco, o prazo mais curto primeiro", () => {
    const items = [
      { ...base, id: "b", sla_due_at: iso(90), created_at: iso(-10) },
      { ...base, id: "a", sla_due_at: iso(-5), created_at: iso(-5) },
    ];
    expect(rankWorkItems(items, NOW).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("sem risco: valor do cliente, depois prioridade, depois chegada", () => {
    const items = [
      { ...base, id: "antigo", created_at: iso(-300) },
      { ...base, id: "novo", created_at: iso(-60) },
      { ...base, id: "valor", customer_value: 1000, created_at: iso(-30) },
      { ...base, id: "urgente", priority: 90, created_at: iso(-20) },
      { ...base, id: "prazo-longe", sla_due_at: iso(3600), created_at: iso(-400) },
    ];
    expect(rankWorkItems(items, NOW).map((i) => i.id)).toEqual([
      "valor",
      "urgente",
      "prazo-longe",
      "antigo",
      "novo",
    ]);
  });

  it("não altera a lista original", () => {
    const items = [
      { ...base, id: "x", created_at: iso(-1) },
      { ...base, id: "y", created_at: iso(-2) },
    ];
    rankWorkItems(items, NOW);
    expect(items.map((i) => i.id)).toEqual(["x", "y"]);
  });

  it("explica a posição", () => {
    expect(rankReason({ ...base, id: "1", sla_due_at: iso(-1), created_at: iso(-9) }, NOW)).toMatch(
      /passou/,
    );
    expect(rankReason({ ...base, id: "1", sla_due_at: iso(60), created_at: iso(-9) }, NOW)).toMatch(
      /acabando/,
    );
    expect(rankReason({ ...base, id: "1", customer_value: 10, created_at: iso(-9) }, NOW)).toMatch(
      /negócio/,
    );
  });
});

describe("estado do atendente", () => {
  it("deriva em atendimento pela carga e pós-atendimento pelo prazo", () => {
    expect(deriveAgentState({ chosen: "available", wrapUpUntil: null, load: 0, now: NOW })).toBe(
      "available",
    );
    expect(deriveAgentState({ chosen: "available", wrapUpUntil: null, load: 0.25, now: NOW })).toBe(
      "busy",
    );
    expect(deriveAgentState({ chosen: "available", wrapUpUntil: iso(30), load: 0, now: NOW })).toBe(
      "wrap_up",
    );
    expect(
      deriveAgentState({ chosen: "available", wrapUpUntil: iso(-30), load: 0, now: NOW }),
    ).toBe("available");
    expect(deriveAgentState({ chosen: "paused", wrapUpUntil: null, load: 1, now: NOW })).toBe(
      "paused",
    );
    expect(deriveAgentState({ chosen: null, wrapUpUntil: null, load: 0, now: NOW })).toBe(
      "offline",
    );
  });
});

describe("escolha de fila pela fala da URA", () => {
  const queues = [
    { id: "fin", name: "Financeiro", skills: ["cobrança", "boleto"] },
    { id: "sup", name: "Suporte técnico", skills: ["suporte"] },
    { id: "ven", name: "Vendas", skills: ["vendas"] },
  ];
  it("casa pela habilidade sem acento", () => {
    expect(matchQueue(queues, "é sobre a cobranca do mês")?.id).toBe("fin");
    expect(matchQueue(queues, "segunda via do boleto")?.id).toBe("fin");
  });
  it("casa pelo nome da fila", () => {
    expect(matchQueue(queues, "Quero falar com vendas")?.id).toBe("ven");
    expect(matchQueue(queues, "problema técnico no sistema")?.id).toBe("sup");
  });
  it("sem casamento devolve null", () => {
    expect(matchQueue(queues, "oi")).toBeNull();
    expect(matchQueue(queues, "")).toBeNull();
  });
  it("normaliza habilidade", () => {
    expect(normalizeSkill("  Cobrança  VIP ")).toBe("cobranca vip");
  });
});

describe("regras de discagem", () => {
  it("vêm todas desligadas por padrão e passam tudo", () => {
    const r = parseDialingRules({});
    expect(r).toEqual(DEFAULT_DIALING);
    expect(anyRuleOn(r)).toBe(false);
    expect(
      checkDialingRules(r, {
        now: NOW,
        timeZone: "America/Sao_Paulo",
        attempts: 99,
        onDncList: true,
      }).ok,
    ).toBe(true);
  });

  it("descarta valor inválido", () => {
    const r = parseDialingRules({
      window: { enabled: true, start: "25:00", end: "x", days: [1, 9, "2"] },
      attempts: { enabled: true, max_per_number: 500 },
    });
    expect(r.window.start).toBe("09:00");
    expect(r.window.days).toEqual([1]);
    expect(r.attempts.max_per_number).toBe(3);
  });

  it("janela de horário no fuso da conta", () => {
    const rules = parseDialingRules({
      window: { enabled: true, start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    });
    // 15:00 UTC numa terça = 12:00 em São Paulo
    expect(
      checkDialingRules(rules, {
        now: NOW,
        timeZone: "America/Sao_Paulo",
        attempts: 0,
        onDncList: false,
      }).ok,
    ).toBe(true);
    const night = new Date("2026-10-27T23:30:00Z"); // 20:30 em SP
    const res = checkDialingRules(rules, {
      now: night,
      timeZone: "America/Sao_Paulo",
      attempts: 0,
      onDncList: false,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("window");
    const sunday = new Date("2026-11-01T15:00:00Z");
    expect(
      checkDialingRules(rules, {
        now: sunday,
        timeZone: "America/Sao_Paulo",
        attempts: 0,
        onDncList: false,
      }).code,
    ).toBe("window");
  });

  it("teto de tentativas e lista de não contatar", () => {
    const rules = parseDialingRules({
      attempts: { enabled: true, max_per_number: 2, period_days: 1 },
      dnc: { enabled: true },
    });
    const ctx = { now: NOW, timeZone: "America/Sao_Paulo", attempts: 2, onDncList: false };
    expect(checkDialingRules(rules, ctx).code).toBe("attempts");
    expect(checkDialingRules(rules, { ...ctx, attempts: 1 }).ok).toBe(true);
    expect(checkDialingRules(rules, { ...ctx, attempts: 0, onDncList: true }).code).toBe("dnc");
  });

  it("prefixo de saída por campanha", () => {
    expect(applyDialPrefix("+5511987654321", null)).toBe("+5511987654321");
    expect(applyDialPrefix("+5511987654321", "015")).toBe("01511987654321");
    expect(applyDialPrefix("+351912345678", "00")).toBe("00351912345678");
  });
});

describe("lista do Não Me Perturbe", () => {
  it("lê CSV e TXT, normaliza e tira repetidos", () => {
    const text =
      "telefone;data\n(11) 98765-4321;2026-01-01\n11987654321\n+55 21 3456-7890\nabc\n123\n";
    expect(parseDncFile(text).sort()).toEqual(["5511987654321", "552134567890"]);
  });
  it("divide em lotes", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("supervisão e transferência na Zadarma", () => {
  it("monta o passo a passo do 007", () => {
    const steps = superviseSteps("101", "whisper");
    expect(steps[0]).toMatch(/007/);
    expect(steps[1]).toMatch(/101/);
    expect(steps[2]).toMatch(/Tecle 5/);
  });
  it("código da transferência com apresentação", () => {
    expect(attendedTransferCode("102")).toBe("*102#");
  });
  it("formata tempo", () => {
    expect(formatSeconds(42)).toBe("42s");
    expect(formatSeconds(125)).toBe("2min 05s");
    expect(formatSeconds(3720)).toBe("1h 02min");
    expect(formatSeconds(207 * 3600 + 37 * 60)).toBe("8 dias 15h");
    expect(formatSeconds(null)).toBe("–");
  });
});

describe("dados sensíveis antes da IA", () => {
  it("mascara CPF, CNPJ, cartão e senha", async () => {
    const { maskSensitive } = await import("./lib");
    const out = maskSensitive(
      "meu cpf 123.456.789-09, cnpj 12.345.678/0001-90, cartão 4111 1111 1111 1111 e a senha é abc123",
    );
    expect(out).toContain("[CPF]");
    expect(out).toContain("[CNPJ]");
    expect(out).toContain("[CARTÃO]");
    expect(out).toContain("senha [OCULTA]");
    expect(out).not.toMatch(/abc123|4111|123\.456/);
  });
});
