import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRAZOS,
  MOMENT_PRIORITY,
  addDays,
  avaliacoesOf,
  cleanUrl,
  computeMoment,
  daysBetween,
  formatDay,
  hasOpenComplaint,
  isoDay,
  momentContext,
  momentCounts,
  prazosOf,
  purchaseDateOf,
  readsCancelIntent,
  reviewLine,
  reviewsOf,
  reviewsSummary,
  todayIso,
  withAvaliacoes,
  withComplaintStatus,
  withCustomDate,
  withPrazos,
  withReview,
  withoutReview,
  type MomentConfig,
  type MomentInput,
} from "./moment";

// 18/11/2026 ao meio-dia em Brasília
const NOW = Date.parse("2026-11-18T15:00:00Z");
const CFG: MomentConfig = { prazos: DEFAULT_PRAZOS, recompraDias: 30, paradoDias: 60 };
const base: MomentInput = { purchaseDate: null, customerSince: null, renewalDate: null };
const at = (purchaseDate: string, extra: Partial<MomentInput> = {}, cfg = CFG) =>
  computeMoment({ ...base, purchaseDate, ...extra }, cfg, NOW);

describe("datas", () => {
  it("lê data ISO, brasileira e ISO com hora; recusa o resto", () => {
    expect(isoDay("2026-11-18")).toBe("2026-11-18");
    expect(isoDay("18/11/2026")).toBe("2026-11-18");
    expect(isoDay("5/1/2026")).toBe("2026-01-05");
    expect(isoDay("2026-11-18T10:00:00Z")).toBe("2026-11-18");
    expect(isoDay("31/02/2026")).toBeNull();
    expect(isoDay("ontem")).toBeNull();
    expect(isoDay(20261118)).toBeNull();
  });

  it("o dia vira à meia-noite de Brasília, não em UTC", () => {
    expect(todayIso(Date.parse("2026-11-19T02:30:00Z"))).toBe("2026-11-18");
    expect(todayIso(Date.parse("2026-11-19T03:30:00Z"))).toBe("2026-11-19");
  });

  it("soma e diferença de dias atravessam mês e ano", () => {
    expect(addDays("2026-11-18", 90)).toBe("2027-02-16");
    expect(daysBetween("2026-11-11", "2026-11-18")).toBe(7);
    expect(daysBetween("2026-11-18", "2026-11-11")).toBe(-7);
    expect(formatDay("2026-11-18")).toBe("18/11/2026");
  });
});

describe("prazos e links da conta", () => {
  it("sem nada gravado vale o padrão (o remix não copia dados)", () => {
    expect(prazosOf(undefined)).toEqual({
      arrependimento_dias: 7,
      garantia_dias: 90,
      renovacao_aviso_dias: 30,
    });
    expect(prazosOf({ posvenda: { rules: { boas_vindas: true } } })).toEqual(DEFAULT_PRAZOS);
    expect(avaliacoesOf({})).toEqual({ google_url: "", reclame_aqui_url: "" });
  });

  it("garantia customizada entra, valor absurdo é cortado e o resto do settings fica", () => {
    const s = withPrazos(
      { modules: ["gestao"], posvenda: { rules: { pesquisa: true }, daily_cap: 10 } },
      { garantia_dias: 365 },
    );
    expect(prazosOf(s)).toEqual({ ...DEFAULT_PRAZOS, garantia_dias: 365 });
    expect(s).toMatchObject({
      modules: ["gestao"],
      posvenda: { rules: { pesquisa: true }, daily_cap: 10 },
    });
    expect(
      prazosOf({ posvenda: { prazos: { arrependimento_dias: 9999, garantia_dias: -3 } } }),
    ).toEqual({ arrependimento_dias: 60, garantia_dias: 90, renovacao_aviso_dias: 30 });
  });

  it("link só entra se for endereço de verdade", () => {
    expect(cleanUrl("g.page/r/abc/review")).toBe("https://g.page/r/abc/review");
    expect(cleanUrl("javascript:alert(1)")).toBe("");
    expect(cleanUrl("  ")).toBe("");
    const s = withAvaliacoes({ posvenda: { daily_cap: 5 } }, { google_url: "https://g.page/x" });
    expect(avaliacoesOf(s)).toEqual({ google_url: "https://g.page/x", reclame_aqui_url: "" });
    expect(s).toMatchObject({ posvenda: { daily_cap: 5 } });
  });
});

describe("momento do cliente", () => {
  it("prioridade do selo: risco, arrependimento, renovação, recompra, garantia, fora da garantia", () => {
    expect([...MOMENT_PRIORITY]).toEqual([
      "risco_cancelamento",
      "arrependimento",
      "renovacao",
      "recompra",
      "garantia",
      "fora_garantia",
      "sem_data",
    ]);
  });

  it("dia 3 de 7 do prazo de arrependimento, com a data em que vence", () => {
    const m = at("2026-11-15");
    expect(m.primary.key).toBe("arrependimento");
    expect(m.primary.detail).toBe("Dia 3 de 7 · vence em 22/11/2026");
    expect(m.withdrawal).toEqual({ active: true, day: 3, of: 7, endsOn: "2026-11-22" });
    // também está em garantia: vem como secundário
    expect(m.secondary.map((s) => s.key)).toEqual(["garantia"]);
    expect(m.warranty).toMatchObject({ active: true, endsOn: "2027-02-13", daysLeft: 87 });
  });

  it("dia 7 exato ainda está no prazo; no dia seguinte saiu", () => {
    const last = at("2026-11-11");
    expect(last.withdrawal).toMatchObject({ active: true, day: 7, of: 7, endsOn: "2026-11-18" });
    expect(last.primary).toMatchObject({
      key: "arrependimento",
      detail: "Dia 7 de 7 · vence hoje",
    });

    const after = at("2026-11-10");
    expect(after.withdrawal?.active).toBe(false);
    expect(after.primary.key).toBe("garantia");
    expect(after.keys).not.toContain("arrependimento");
  });

  it("comprou hoje: prazo aberto, sem contar o dia da compra", () => {
    const m = at("2026-11-18");
    expect(m.purchase.daysSince).toBe(0);
    expect(m.primary.detail).toBe("Comprou hoje · prazo de 7 dias vence em 25/11/2026");
  });

  it("garantia customizada: 365 dias segura o cliente em garantia; padrão de 90 já venceu", () => {
    const bought = "2026-06-01"; // 170 dias antes
    expect(at(bought).keys).toContain("fora_garantia");
    expect(at(bought).warranty).toMatchObject({ active: false, endsOn: "2026-08-30" });
    const long = at(bought, {}, { ...CFG, prazos: { ...DEFAULT_PRAZOS, garantia_dias: 365 } });
    expect(long.primary.key).toBe("garantia");
    expect(long.primary.detail).toBe("Garantia até 01/06/2027");
  });

  it("garantia vence no último dia, não um dia antes", () => {
    const m = at("2026-08-20"); // 90 dias antes de 18/11
    expect(m.warranty).toMatchObject({ active: true, endsOn: "2026-11-18", daysLeft: 0 });
    expect(at("2026-08-19").warranty?.active).toBe(false);
  });

  it("dois momentos ao mesmo tempo: hora da recompra é o selo, em garantia fica de secundário", () => {
    const m = at("2026-10-18"); // 31 dias
    expect(m.keys).toEqual(["recompra", "garantia"]);
    expect(m.primary).toMatchObject({ key: "recompra", detail: "Comprou há 31 dias" });
    expect(m.secondary[0]).toMatchObject({ key: "garantia", detail: "Garantia até 16/01/2027" });
  });

  it("recompra usa o ciclo da regra: aparece 3 dias antes e some depois de muito tempo", () => {
    expect(at("2026-10-22").keys).toContain("recompra"); // 27 dias, ciclo de 30
    expect(at("2026-10-23").keys).not.toContain("recompra"); // 26 dias
    expect(at("2026-09-01").keys).not.toContain("recompra"); // 78 dias: passou da janela
    const ciclo60 = { ...CFG, recompraDias: 60 };
    expect(at("2026-10-18", {}, ciclo60).keys).not.toContain("recompra");
    expect(at("2026-09-19", {}, ciclo60).keys).toContain("recompra"); // 60 dias
  });

  it("renovação: vira alerta dentro do aviso e ganha de recompra e garantia", () => {
    const m = at("2026-10-18", { renewalDate: "2026-11-30" });
    expect(m.primary).toMatchObject({
      key: "renovacao",
      detail: "Renova em 12 dias (30/11/2026)",
    });
    expect(m.renewal).toEqual({ date: "2026-11-30", inDays: 12, soon: true });
    expect(m.keys).toEqual(["renovacao", "recompra", "garantia"]);

    // fora do aviso de 30 dias: a data aparece, mas não vira selo
    const far = at("2026-10-01", { renewalDate: "2027-03-01" });
    expect(far.renewal?.soon).toBe(false);
    expect(far.keys).not.toContain("renovacao");
    // aviso maior configurado pela conta
    const aviso = { ...CFG, prazos: { ...DEFAULT_PRAZOS, renovacao_aviso_dias: 120 } };
    expect(at("2026-10-01", { renewalDate: "2027-03-01" }, aviso).keys).toContain("renovacao");
  });

  it("renovação hoje e vencida há pouco continuam pedindo ação; muito antiga não", () => {
    expect(at("2026-01-01", { renewalDate: "2026-11-18" }).primary.detail).toBe("Renova hoje");
    expect(at("2026-01-01", { renewalDate: "2026-11-10" }).primary.detail).toBe(
      "Renovação venceu há 8 dias",
    );
    expect(at("2026-01-01", { renewalDate: "2026-06-01" }).keys).not.toContain("renovacao");
  });

  it("risco de cancelamento ganha de tudo e diz o motivo", () => {
    const m = at("2026-11-15", { risk: { npsLast: 3 } });
    expect(m.primary).toMatchObject({
      key: "risco_cancelamento",
      detail: "Deu nota 3 na pesquisa",
    });
    expect(m.secondary.map((s) => s.key)).toEqual(["arrependimento", "garantia"]);
  });

  it("risco combina os sinais que já existem, sem modelo novo", () => {
    const reasons = (risk: NonNullable<MomentInput["risk"]>) =>
      at("2026-09-01", { risk }).riskReasons;
    expect(reasons({ openComplaint: true })).toEqual(["Reclamação aberta no Reclame Aqui"]);
    expect(reasons({ cancelIntent: true })).toEqual(["Falou em cancelar ou desistir na conversa"]);
    expect(reasons({ breachedTickets: 1, openTickets: 1 })).toEqual([
      "Chamado aberto com prazo estourado",
    ]);
    // prazo estourado de chamado já fechado não é risco de hoje
    expect(reasons({ breachedTickets: 2, openTickets: 0 })).toEqual([]);
    expect(reasons({ silentDays: 75 })).toEqual(["Parado há 75 dias sem conversa"]);
    expect(reasons({ silentDays: 59 })).toEqual([]);
    expect(reasons({ taggedAtRisk: true })).toEqual(['Marcado com a etiqueta "em risco"']);
    expect(reasons({ healthLevel: "risk" })).toEqual(["Saúde do cliente em risco"]);
    expect(reasons({ healthLevel: "attention", npsLast: 9 })).toEqual([]);
    // vários sinais: o mais grave primeiro
    expect(reasons({ npsLast: 2, openComplaint: true, silentDays: 90 })).toEqual([
      "Reclamação aberta no Reclame Aqui",
      "Deu nota 2 na pesquisa",
      "Parado há 90 dias sem conversa",
    ]);
  });

  it("a leitura da IA sobre cancelamento", () => {
    expect(readsCancelIntent("Quer cancelar o plano")).toBe(true);
    expect(readsCancelIntent("Pediu reembolso da compra")).toBe(true);
    expect(readsCancelIntent("Dúvida sobre entrega")).toBe(false);
    expect(readsCancelIntent(null)).toBe(false);
  });

  it("sem data de compra: usa o dia em que virou cliente e avisa que é estimada", () => {
    const m = computeMoment({ ...base, customerSince: "2026-11-16T14:00:00Z" }, CFG, NOW);
    expect(m.purchase).toEqual({ date: "2026-11-16", estimated: true, daysSince: 2 });
    expect(m.primary.key).toBe("arrependimento");
  });

  it("sem data de compra e sem quando virou cliente: não inventa prazo", () => {
    const m = computeMoment(base, CFG, NOW);
    expect(m.primary).toMatchObject({ key: "sem_data" });
    expect(m.withdrawal).toBeNull();
    expect(m.warranty).toBeNull();
    expect(m.rebuy).toBeNull();
    expect(m.keys).toEqual(["sem_data"]);
  });

  it("cliente importado sem data não entra em arrependimento só por ter sido importado hoje", () => {
    const m = computeMoment(
      { ...base, customerSince: "2026-11-18T12:00:00Z", imported: true },
      CFG,
      NOW,
    );
    expect(m.primary.key).toBe("sem_data");
    // importado COM data informada conta normal
    const dated = at("2026-11-16", { imported: true });
    expect(dated.primary.key).toBe("arrependimento");
    expect(dated.purchase.estimated).toBe(false);
  });

  it("sem data, mas com risco: o risco aparece e a falta de data fica de secundário", () => {
    const m = computeMoment({ ...base, imported: true, risk: { openComplaint: true } }, CFG, NOW);
    expect(m.keys).toEqual(["risco_cancelamento", "sem_data"]);
  });

  it("data de compra no futuro (erro de digitação) conta como hoje", () => {
    expect(at("2026-12-25").purchase.daysSince).toBe(0);
  });

  it("contagem da carteira: quem está em dois momentos conta nos dois", () => {
    const c = momentCounts([at("2026-11-15"), at("2026-10-18"), computeMoment(base, CFG, NOW)]);
    expect(c).toMatchObject({
      total: 3,
      arrependimento: 1,
      recompra: 1,
      garantia: 2,
      sem_data: 1,
      risco_cancelamento: 0,
    });
  });
});

describe("o que o atendente de IA lê", () => {
  it("data da compra, dia do prazo de arrependimento e garantia", () => {
    const lines = momentContext(at("2026-11-15"), DEFAULT_PRAZOS);
    expect(lines[0]).toBe(
      "Momento no pós-venda: comprou em 15/11/2026; está no dia 3 de 7 do prazo de arrependimento (vence em 22/11/2026); garantia até 13/02/2027.",
    );
    expect(lines.at(-1)).toContain("passe para a equipe");
  });

  it("prazos vencidos e renovação são ditos com a data", () => {
    const [line] = momentContext(at("2026-06-01", { renewalDate: "2026-12-01" }), DEFAULT_PRAZOS);
    expect(line).toContain("o prazo de arrependimento de 7 dias venceu em 08/06/2026");
    expect(line).toContain("garantia de 90 dias vencida em 30/08/2026");
    expect(line).toContain("renova em 13 dias (01/12/2026)");
  });

  it("sem data não afirma prazo; com risco pede cuidado", () => {
    expect(momentContext(computeMoment(base, CFG, NOW), DEFAULT_PRAZOS)[0]).toContain(
      "sem data de compra registrada",
    );
    const risky = momentContext(
      at("2026-11-15", { risk: { openComplaint: true } }),
      DEFAULT_PRAZOS,
    );
    expect(risky.join("\n")).toContain("Risco de cancelamento: Reclamação aberta no Reclame Aqui");
  });

  it("nenhum texto usa travessão", () => {
    const all = [
      ...momentContext(at("2026-11-15", { renewalDate: "2026-11-30" }), DEFAULT_PRAZOS),
      at("2026-11-15").primary.detail,
      at("2026-06-01").primary.detail,
    ].join(" ");
    expect(all).not.toContain("—");
  });
});

describe("data da compra e avaliações no contato", () => {
  it("grava, troca e apaga a data sem perder os outros campos", () => {
    const c = withCustomDate({ cpf: "123" }, "ultima_compra", "15/11/2026");
    expect(c).toEqual({ cpf: "123", ultima_compra: "2026-11-15" });
    expect(purchaseDateOf(c)).toBe("2026-11-15");
    expect(withCustomDate(c, "ultima_compra", null)).toEqual({ cpf: "123" });
    expect(purchaseDateOf({ ultima_compra: "lixo" })).toBeNull();
    expect(purchaseDateOf(null)).toBeNull();
  });

  it("registro manual: pedido, avaliação com nota e reclamação com situação", () => {
    let c: unknown = { cpf: "123" };
    c = withReview(c, { id: "a", kind: "pedido", at: "2026-11-10" });
    c = withReview(c, { id: "b", kind: "google", at: "2026-11-12", nota: 5 });
    c = withReview(c, { id: "c", kind: "reclame_aqui", at: "2026-11-15", status: "aberta" });
    const list = reviewsOf(c);
    expect(list.map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(list.map(reviewLine)).toEqual([
      "Reclamou no Reclame Aqui em 15/11/2026 (aberta)",
      "Avaliou no Google em 12/11/2026 (nota 5 de 5)",
      "Pedimos avaliação em 10/11/2026",
    ]);
    expect(hasOpenComplaint(list)).toBe(true);
    expect((c as Record<string, unknown>)["cpf"]).toBe("123");

    c = withComplaintStatus(c, "c", "resolvida");
    expect(hasOpenComplaint(reviewsOf(c))).toBe(false);
    c = withoutReview(c, "a");
    expect(reviewsOf(c).map((e) => e.id)).toEqual(["c", "b"]);
  });

  it("lixo gravado no campo não quebra a leitura", () => {
    expect(reviewsOf({ avaliacoes: "texto" })).toEqual([]);
    expect(
      reviewsOf({
        avaliacoes: [null, { kind: "outro", at: "2026-11-10" }, { kind: "google", at: "x" }],
      }),
    ).toEqual([]);
    // nota fora de 1 a 5 é ignorada, o registro fica
    expect(reviewsOf({ avaliacoes: [{ kind: "google", at: "2026-11-10", nota: 11 }] })[0]).toEqual({
      id: "google-2026-11-10",
      kind: "google",
      at: "2026-11-10",
    });
  });

  it("resumo do painel: pedidos, avaliações com média e reclamações abertas", () => {
    const a = reviewsOf({
      avaliacoes: [
        { id: "1", kind: "pedido", at: "2026-11-01", via: "regra" },
        { id: "2", kind: "google", at: "2026-11-02", nota: 5 },
      ],
    });
    const b = reviewsOf({
      avaliacoes: [
        { id: "3", kind: "google", at: "2026-11-03", nota: 4 },
        { id: "4", kind: "reclame_aqui", at: "2026-11-04" },
        { id: "5", kind: "reclame_aqui", at: "2026-11-05", status: "resolvida" },
      ],
    });
    expect(reviewsSummary([a, b])).toEqual({
      pedidos: 1,
      avaliacoes: 2,
      media: 4.5,
      reclamacoesAbertas: 1,
      reclamacoes: 2,
    });
    expect(reviewsSummary([])).toMatchObject({ pedidos: 0, media: null, reclamacoesAbertas: 0 });
  });
});
