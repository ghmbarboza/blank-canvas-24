import { describe, expect, it } from "vitest";

import {
  createHubspotAdapter,
  hsContactToLocal,
  hsDealToLocal,
  localContactToHs,
  localDealToHs,
  pickHsStage,
  searchBody,
  type HsPipeline,
} from "./hubspot";
import {
  createRdAdapter,
  localDealToRd,
  rdContactToLocal,
  rdDealToLocal,
  RD_BASE,
} from "./rdstation";
import { decide, diffFields } from "./types";

// Fixtures no formato dos exemplos da documentação oficial (developers.rdstation.com, developers.hubspot.com).
const RD_CONTACT = {
  _id: "62bef505b1b6e300209c91f4",
  name: "Renan Porto",
  title: "Gerente",
  emails: [{ _id: "x", email: "Fulano@Email.com.br" }],
  phones: [{ phone: "(11) 97173-0783", type: "cellphone" }],
  organization_id: "64ca5196268ec600013bac1b",
  updated_at: "2023-08-28T20:47:22.516-03:00",
};
const RD_DEAL = {
  _id: "64dccdc7902ce80001d9fa9f",
  name: "Negociação",
  amount_total: 399.83,
  win: null,
  prediction_date: "2023-09-30",
  deal_stage: { _id: "s1", name: "Proposta enviada" },
  contacts: [{ name: "Alexandre", emails: [{ email: "email1@empresa.com" }] }],
  updated_at: "2023-08-30T22:43:58.453-03:00",
};
const HS_PIPELINES: HsPipeline[] = [
  {
    id: "default",
    label: "Pipeline de vendas",
    stages: [
      {
        id: "appointmentscheduled",
        label: "Reunião marcada",
        metadata: { isClosed: "false", probability: "0.2" },
      },
      {
        id: "closedwon",
        label: "Fechado ganho",
        metadata: { isClosed: "true", probability: "1.0" },
      },
      {
        id: "closedlost",
        label: "Fechado perdido",
        metadata: { isClosed: "true", probability: "0.0" },
      },
    ],
  },
];

function fakeFetch(
  routes: Record<string, (init: RequestInit | undefined, url: URL) => unknown>,
  calls: { method: string; url: string; body: unknown }[] = [],
) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url: url.toString(),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const key = `${method} ${url.pathname}`;
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    const out = h(init, url);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
}

describe("regra de conflito (última alteração vence)", () => {
  const link = {
    remote_updated_at: "2026-10-01T10:00:00Z",
    local_synced_at: "2026-10-01T10:00:00Z",
  };
  it("só um lado mudou", () => {
    expect(decide(link, "2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z")).toEqual({
      action: "pull",
      conflict: false,
    });
    expect(decide(link, "2026-10-02T10:00:00Z", "2026-10-01T10:00:00Z")).toEqual({
      action: "push",
      conflict: false,
    });
  });
  it("nenhum mudou (com tolerância de relógio)", () => {
    expect(decide(link, "2026-10-01T10:00:01Z", "2026-10-01T10:00:00Z")).toEqual({
      action: "skip",
    });
  });
  it("os dois mudaram: o mais recente vence e marca conflito", () => {
    expect(decide(link, "2026-10-03T10:00:00Z", "2026-10-02T10:00:00Z")).toEqual({
      action: "push",
      conflict: true,
    });
    expect(decide(link, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z")).toEqual({
      action: "pull",
      conflict: true,
    });
  });
  it("sem vínculo, vence o mais novo sem marcar conflito", () => {
    expect(decide(null, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z")).toEqual({
      action: "pull",
      conflict: false,
    });
  });
  it("diferença de campos ignora caixa e espaço", () => {
    expect(
      diffFields(
        { name: "Ana ", email: "a@x.com", phone: null, job_title: null },
        { name: "ana", email: "b@x.com", phone: null, job_title: null },
      ),
    ).toEqual(["email"]);
  });
});

describe("RD Station CRM — contrato", () => {
  it("contato de lá vira contato daqui (e-mail minúsculo, telefone com 55)", () => {
    const r = rdContactToLocal(RD_CONTACT);
    expect(r).toMatchObject({
      id: "62bef505b1b6e300209c91f4",
      data: {
        name: "Renan Porto",
        email: "fulano@email.com.br",
        phone: "5511971730783",
        job_title: "Gerente",
      },
      refs: { companyId: "64ca5196268ec600013bac1b" },
    });
  });

  it("negociação: situação pelo win, etapa pelo nome, contatos pelo e-mail", () => {
    const r = rdDealToLocal(RD_DEAL);
    expect(r.data).toEqual({
      title: "Negociação",
      value: 399.83,
      stageName: "Proposta enviada",
      status: "open",
      expected_close_date: "2023-09-30",
    });
    expect(r.refs.contactEmails).toEqual(["email1@empresa.com"]);
    expect(rdDealToLocal({ ...RD_DEAL, win: true }).data.status).toBe("won");
    expect(rdDealToLocal({ ...RD_DEAL, win: false }).data.status).toBe("lost");
  });

  it("criação de negociação leva etapa dentro de deal e empresa no topo; atualização leva a etapa no topo", () => {
    const stages = [{ _id: "s1", name: "Proposta enviada" }];
    const deal = {
      title: "X",
      value: 10,
      stageName: "proposta enviada",
      status: "won" as const,
      expected_close_date: null,
    };
    expect(localDealToRd(deal, { companyId: "o1" }, stages, true)).toEqual({
      deal: { name: "X", win: true, deal_stage_id: "s1" },
      organization: { _id: "o1" },
    });
    expect(localDealToRd(deal, { companyId: "o1" }, stages, false)).toEqual({
      deal: { name: "X", win: true, organization_id: "o1" },
      deal_stage_id: "s1",
    });
  });

  it("teste de conexão usa GET /token/check com o token na query", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const ad = createRdAdapter(
      "tk123",
      fakeFetch(
        { "GET /api/v1/token/check": () => ({ name: "Ana", organization: "ACME" }) },
        calls,
      ),
    );
    await expect(ad.test()).resolves.toBe("ACME · Ana");
    expect(calls[0]?.url.startsWith(RD_BASE + "/token/check")).toBe(true);
    expect(new URL(calls[0]!.url).searchParams.get("token")).toBe("tk123");
  });

  it("token recusado vira mensagem que diz o que fazer", async () => {
    const ad = createRdAdapter(
      "ruim",
      fakeFetch({
        "GET /api/v1/token/check": () =>
          new Response('{"error":"Permission denied."}', { status: 401 }),
      }),
    );
    await expect(ad.test()).rejects.toThrow("Token da instância");
  });

  it("primeiro passe pagina do mais antigo; depois para no que já viu", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const ad = createRdAdapter(
      "tk",
      fakeFetch(
        {
          "GET /api/v1/contacts": (_i, url) =>
            url.searchParams.get("direction") === "asc"
              ? { contacts: [RD_CONTACT], has_more: true, total: 2 }
              : {
                  contacts: [
                    { ...RD_CONTACT, updated_at: "2026-10-05T10:00:00Z" },
                    { ...RD_CONTACT, _id: "old", updated_at: "2026-09-01T10:00:00Z" },
                  ],
                  has_more: true,
                },
        },
        calls,
      ),
    );
    const first = await ad.list("contact", null, null);
    expect(first.next).toBe("2");
    const inc = await ad.list("contact", "2026-10-01T00:00:00Z", null);
    expect(inc.records.map((r) => r.id)).toEqual(["62bef505b1b6e300209c91f4"]);
    expect(inc.next).toBeNull();
    expect(new URL(calls[1]!.url).searchParams.get("order")).toBe("updated_at");
  });
});

describe("HubSpot — contrato", () => {
  it("contato: nome junta first/last, telefone celular primeiro", () => {
    const r = hsContactToLocal({
      id: "101",
      properties: {
        firstname: "Maria",
        lastname: "Silva",
        email: "MARIA@X.COM",
        phone: "+55 48 3333-2222",
        mobilephone: "+55 48 99999-1111",
        jobtitle: "CEO",
        associatedcompanyid: "77",
      },
      updatedAt: "2026-10-01T10:00:00.000Z",
    });
    expect(r.data).toEqual({
      name: "Maria Silva",
      email: "maria@x.com",
      phone: "5548999991111",
      job_title: "CEO",
    });
    expect(r.refs.companyId).toBe("77");
    expect(localContactToHs(r.data)).toEqual({
      firstname: "Maria",
      lastname: "Silva",
      email: "maria@x.com",
      phone: "+5548999991111",
      jobtitle: "CEO",
    });
  });

  it("negócio: etapa fechada com probabilidade 1 = ganho", () => {
    const r = hsDealToLocal(
      {
        id: "9",
        properties: {
          dealname: "Plano anual",
          amount: "1200",
          dealstage: "closedwon",
          closedate: "2026-11-01T00:00:00Z",
        },
      },
      HS_PIPELINES,
    );
    expect(r.data).toEqual({
      title: "Plano anual",
      value: 1200,
      stageName: "Fechado ganho",
      status: "won",
      expected_close_date: "2026-11-01",
    });
  });

  it("etapa daqui → etapa de lá: nome, depois a fechada do mesmo tipo", () => {
    expect(
      pickHsStage(
        {
          title: "a",
          value: null,
          stageName: "Reunião marcada",
          status: "open",
          expected_close_date: null,
        },
        HS_PIPELINES,
      ),
    ).toEqual({ pipeline: "default", stage: "appointmentscheduled" });
    expect(
      pickHsStage(
        { title: "a", value: null, stageName: "Ganho", status: "won", expected_close_date: null },
        HS_PIPELINES,
      )?.stage,
    ).toBe("closedwon");
    expect(
      pickHsStage(
        {
          title: "a",
          value: null,
          stageName: "Perdido",
          status: "lost",
          expected_close_date: null,
        },
        HS_PIPELINES,
      )?.stage,
    ).toBe("closedlost");
    expect(
      localDealToHs(
        {
          title: "a",
          value: 5,
          stageName: null,
          status: "open",
          expected_close_date: "2026-12-01",
        },
        HS_PIPELINES,
        true,
      ),
    ).toEqual({
      dealname: "a",
      amount: "5",
      closedate: "2026-12-01T12:00:00Z",
      pipeline: "default",
      dealstage: "appointmentscheduled",
    });
  });

  it("busca incremental filtra pela data de alteração certa de cada objeto", () => {
    expect(searchBody("contact", "2026-10-01T00:00:00Z", null).filterGroups[0]?.filters[0]).toEqual(
      {
        propertyName: "lastmodifieddate",
        operator: "GT",
        value: String(Date.parse("2026-10-01T00:00:00Z")),
      },
    );
    expect(searchBody("deal", null, "200")).toMatchObject({
      filterGroups: [],
      after: "200",
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
    });
  });

  it("teste de conexão: GET barato de contatos com Bearer", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const ad = createHubspotAdapter(
      "pat-na1-x",
      fakeFetch(
        {
          "GET /crm/v3/objects/contacts": () => ({ results: [] }),
          "GET /account-info/v3/details": () => ({ portalId: 123 }),
        },
        calls,
      ),
    );
    await expect(ad.test()).resolves.toBe("HubSpot · conta 123");
    expect(calls[0]?.url).toBe("https://api.hubapi.com/crm/v3/objects/contacts?limit=1");
  });

  it("401 e 403 viram instrução", async () => {
    const ad401 = createHubspotAdapter(
      "x",
      fakeFetch({
        "GET /crm/v3/objects/contacts": () =>
          new Response('{"status":"error","category":"INVALID_AUTHENTICATION"}', { status: 401 }),
      }),
    );
    await expect(ad401.test()).rejects.toThrow("Apps privados");
    const ad403 = createHubspotAdapter(
      "x",
      fakeFetch({
        "GET /crm/v3/objects/contacts": () =>
          new Response('{"message":"This app hasn\'t been granted all required scopes"}', {
            status: 403,
          }),
      }),
    );
    await expect(ad403.test()).rejects.toThrow("escopos");
  });

  it("criar negócio associa contato e empresa pelo endpoint padrão", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const ad = createHubspotAdapter(
      "x",
      fakeFetch(
        {
          "GET /crm/v3/pipelines/deals": () => ({ results: HS_PIPELINES }),
          "POST /crm/v3/objects/deals": () => ({
            id: "55",
            properties: {},
            updatedAt: "2026-10-27T10:00:00Z",
          }),
          "PUT /crm/v4/objects/deals/55/associations/default/companies/77": () => ({}),
          "PUT /crm/v4/objects/deals/55/associations/default/contacts/101": () => ({}),
        },
        calls,
      ),
    );
    const r = await ad.create(
      "deal",
      { title: "N", value: 1, stageName: null, status: "open", expected_close_date: null },
      { companyId: "77", contactIds: ["101"] },
    );
    expect(r).toEqual({ id: "55", updatedAt: "2026-10-27T10:00:00Z" });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toContain(
      "PUT /crm/v4/objects/deals/55/associations/default/contacts/101",
    );
  });
});
