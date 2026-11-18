import { describe, expect, it } from "vitest";

import type { ActivityReport, AiReport, SalesReport } from "./api";
import type { OpsReport } from "./api-revenue";
import {
  activityHeadline,
  aiHeadline,
  attributionHeadline,
  mrrHeadline,
  opsHeadline,
  salesHeadline,
  serviceHeadline,
  type Segment,
} from "./headlines";

const text = (s: Segment[] | undefined) =>
  (s ?? []).map((x) => (typeof x === "string" ? x : x.n)).join("");

const sales = (totals: Partial<SalesReport["totals"]>, lost: SalesReport["lost_reasons"] = []) =>
  ({
    pipeline_id: null,
    funnel: [],
    totals: {
      created: 0,
      won: 0,
      lost: 0,
      won_value: 0,
      avg_ticket: 0,
      win_rate: null,
      avg_cycle_days: null,
      ...totals,
    },
    lost_reasons: lost,
    by_owner: [],
    by_product: [],
    monthly: [],
  }) satisfies SalesReport;

describe("salesHeadline", () => {
  it("sem movimento ensina o próximo passo", () => {
    const h = salesHeadline(sales({}));
    expect(text(h.lead)).toBe("Nenhum negócio foi criado ou fechado neste período.");
    expect(text(h.aside)).toContain("funil");
  });
  it("destaca ganhos, taxa e o motivo de perda mais comum", () => {
    const h = salesHeadline(
      sales(
        {
          created: 10,
          won: 3,
          lost: 4,
          won_value: 9000,
          avg_ticket: 3000,
          win_rate: 43,
          avg_cycle_days: 12,
        },
        [{ reason: "Preço", count: 3, value: 5000 }],
      ),
    );
    expect(text(h.lead)).toMatch(
      /^A equipe ganhou 3 negócios e .+ no período, fechando 43% do que foi decidido\.$/,
    );
    expect(text(h.aside)).toContain("12 dias");
    expect(text(h.aside)).toContain("“Preço”, em 75% das perdas.");
    expect(h.lead.filter((s) => typeof s !== "string")).toHaveLength(3);
  });
});

describe("aiHeadline", () => {
  const ai = (r: Partial<AiReport>): AiReport => ({
    llm_monthly: [],
    by_purpose: [],
    cost_monthly: [],
    resolution: { with_ai: 0, without_human: 0, rate: null },
    ...r,
  });
  it("frase da manchete usa a taxa de resolução sem humano", () => {
    const h = aiHeadline(
      ai({
        resolution: { with_ai: 200, without_human: 124, rate: 62 },
        llm_monthly: [
          { month: "2026-10", calls: 1000, errors: 5, input_tokens: 1, output_tokens: 1 },
        ],
      }),
    );
    expect(text(h.lead)).toBe(
      "A IA resolveu 62% das conversas em que entrou sem passar para a equipe: 124 de 200.",
    );
    expect(text(h.aside)).toContain("0,5% de erro");
  });
  it("sem uso não inventa número", () => {
    expect(text(aiHeadline(ai({})).lead)).toContain("ainda não atendeu");
  });
});

describe("attributionHeadline", () => {
  it("aponta a origem com mais leads e a que mais fechou", () => {
    const h = attributionHeadline(
      {
        first_touch: [
          { source: "instagram", leads: 25, revenue: 0, deals: 0 },
          { source: "whatsapp", leads: 75, revenue: 0, deals: 0 },
        ],
        last_touch: [{ source: "whatsapp", revenue: 5000, deals: 2 }],
        campaigns: [],
      },
      (s) => s.toUpperCase(),
    );
    expect(text(h.lead)).toBe("WHATSAPP trouxe 75% dos 100 leads do período.");
    expect(text(h.aside)).toContain("2 negócios");
  });
});

describe("serviceHeadline", () => {
  it("monta só com as chaves que vieram", () => {
    const h = serviceHeadline({ created: 40, resolved: 30, sla_met_pct: 87.4 });
    expect(text(h.lead)).toBe(
      "40 chamados foram abertos no período e 30 foram resolvidos, 87% dentro do prazo combinado.",
    );
    expect(h.aside).toBeUndefined();
  });
});

describe("activityHeadline", () => {
  const act = (r: Partial<ActivityReport>): ActivityReport => ({
    total: 0,
    avg_minutes: null,
    total_minutes: 0,
    by_direction: {},
    by_status: {},
    daily: [],
    ...r,
  });
  it("ligações: total, duração e taxa de atendimento", () => {
    const h = activityHeadline(
      act({
        total: 20,
        avg_minutes: 4,
        total_minutes: 80,
        by_status: { completed: 15, no_answer: 5 },
      }),
      "calls",
    );
    expect(text(h.lead)).toBe("20 ligações no período, com duração média de 4 min.");
    expect(text(h.aside)).toMatch(/^75% foram atendidas/);
  });
  it("reuniões: aponta quem não compareceu", () => {
    const h = activityHeadline(act({ total: 10, by_status: { ended: 8, no_show: 2 } }), "meetings");
    expect(text(h.aside)).toContain("20%");
  });
});

describe("opsHeadline e mrrHeadline", () => {
  it("nível de serviço e desistências", () => {
    const service = {
      sla_seconds: 20,
      inbound: 100,
      answered: 90,
      abandoned: 10,
      service_level: 80,
      avg_wait_seconds: 12,
      avg_talk_seconds: 200,
      business_days: 20,
      daily: [],
      agents: [],
    } satisfies OpsReport["service"];
    const h = opsHeadline(service);
    expect(text(h.lead)).toBe("80% das ligações recebidas foram atendidas em até 20 segundos.");
    expect(text(h.aside)).toContain("10 pessoas desistiram");
  });
  it("MRR com crescimento e churn", () => {
    const h = mrrHeadline(
      { current: 2500, arr: 30000, netNew: 500, growthPct: 25, churnPct: 5 },
      12,
    );
    expect(text(h.lead)).toContain("12 clientes");
    expect(text(h.aside)).toBe("Cresceu 25% no último mês, com churn de 5%.");
  });
});
