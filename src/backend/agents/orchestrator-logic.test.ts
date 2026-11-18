import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, DEFAULT_STYLE } from "@/features/agents/catalog";

import {
  buildSystemPrompt,
  controlTools,
  humanDueAt,
  internalToolSpecs,
  entryConflict,
  pickActiveAgent,
  pickHumanOwner,
  resolveRoute,
  type AgentLite,
} from "./orchestrator-logic";

const a = (over: Partial<AgentLite>): AgentLite => ({
  id: over.id ?? "x",
  name: over.name ?? "X",
  role: over.role ?? "sac",
  status: over.status ?? "active",
  channels: over.channels ?? [],
  is_entry: over.is_entry ?? false,
  priority: over.priority ?? 100,
});

const team = [
  a({ id: "r", name: "Recepção", role: "reception", is_entry: true }),
  a({ id: "s", name: "Bia", role: "sdr" }),
  a({ id: "c", name: "Cobrança", role: "collection", channels: ["whatsapp"] }),
  a({ id: "d", name: "Rascunho", role: "sac", status: "draft" }),
  a({ id: "v", name: "Supervisor", role: "supervisor" }),
];

describe("pickActiveAgent", () => {
  it("mantém quem já está na conversa", () => {
    expect(pickActiveAgent(team, "whatsapp", "s")?.id).toBe("s");
  });
  it("sem agente na conversa, entra pela porta de entrada", () => {
    expect(pickActiveAgent(team, "whatsapp", null)?.id).toBe("r");
  });
  it("ignora rascunho, supervisor e canal que o agente não atende", () => {
    expect(pickActiveAgent(team, "instagram", "c")?.id).toBe("r");
    expect(pickActiveAgent([team[3]!, team[4]!], "whatsapp", null)).toBeNull();
  });
  it("sem porta de entrada, segue a ordem dos papéis", () => {
    expect(pickActiveAgent([team[1]!, team[2]!], "whatsapp", null)?.id).toBe("s");
  });
});

describe("um agente por canal", () => {
  const porCanal = [
    a({ id: "geral", name: "Recepção geral", role: "reception", is_entry: true }),
    a({ id: "wa", name: "Ana do WhatsApp", role: "sac", is_entry: true, channels: ["whatsapp"] }),
    a({ id: "ig", name: "Lia do Instagram", role: "sdr", is_entry: true, channels: ["instagram"] }),
    a({
      id: "tel",
      name: "Voz da recepção",
      role: "reception",
      is_entry: true,
      channels: ["voice"],
    }),
  ];
  it("cada canal entra pela sua porta de entrada", () => {
    expect(pickActiveAgent(porCanal, "whatsapp", null)?.id).toBe("wa");
    expect(pickActiveAgent(porCanal, "instagram", null)?.id).toBe("ig");
    expect(pickActiveAgent(porCanal, "voice", null)?.id).toBe("tel");
  });
  it("canal sem agente próprio cai na porta de entrada de todos os canais", () => {
    expect(pickActiveAgent(porCanal, "webchat", null)?.id).toBe("geral");
  });
  it("agente do canal em rascunho não atende: volta para o geral", () => {
    const t = porCanal.map((x) => (x.id === "wa" ? { ...x, status: "draft" as const } : x));
    expect(pickActiveAgent(t, "whatsapp", null)?.id).toBe("geral");
  });
  it("no empate de papel, o dedicado ao canal ganha", () => {
    const t = [
      a({ id: "g", name: "A geral", role: "sac" }),
      a({ id: "w", name: "B WhatsApp", role: "sac", channels: ["whatsapp"] }),
    ];
    expect(pickActiveAgent(t, "whatsapp", null)?.id).toBe("w");
    expect(pickActiveAgent(t, "instagram", null)?.id).toBe("g");
  });
  it("portas de entrada só brigam no mesmo canal (ou duas de todos os canais)", () => {
    expect(entryConflict([], ["whatsapp"])).toBe(false);
    expect(entryConflict([], [])).toBe(true);
    expect(entryConflict(["whatsapp"], ["instagram"])).toBe(false);
    expect(entryConflict(["whatsapp", "sms"], ["sms"])).toBe(true);
  });
});

describe("resolveRoute", () => {
  it("acha por nome, papel e rótulo", () => {
    expect(resolveRoute("bia", team, "r", "whatsapp")?.id).toBe("s");
    expect(resolveRoute("collection", team, "r", "whatsapp")?.id).toBe("c");
    expect(resolveRoute("Cobrança", team, "r", "whatsapp")?.id).toBe("c");
  });
  it("não passa para si, rascunho, supervisor ou canal errado", () => {
    expect(resolveRoute("Recepção", team, "r", "whatsapp")).toBeNull();
    expect(resolveRoute("Rascunho", team, "r", "whatsapp")).toBeNull();
    expect(resolveRoute("Supervisor", team, "r", "whatsapp")).toBeNull();
    expect(resolveRoute("Cobrança", team, "r", "instagram")).toBeNull();
    expect(resolveRoute(42, team, "r", "whatsapp")).toBeNull();
  });
});

describe("pickHumanOwner", () => {
  const members = [
    { user_id: "u1", role: "agent", is_active: true, open_conversations: 5 },
    { user_id: "u2", role: "agent", is_active: true, open_conversations: 1 },
    { user_id: "m1", role: "manager", is_active: true, open_conversations: 0 },
    { user_id: "u3", role: "agent", is_active: false, open_conversations: 0 },
  ];
  it("prefere o dono atual", () => {
    expect(pickHumanOwner(members, ["u1"])).toBe("u1");
  });
  it("dono inativo não conta: vai para o atendente menos ocupado", () => {
    expect(pickHumanOwner(members, ["u3", null])).toBe("u2");
  });
  it("sem atendente, cai no gestor", () => {
    expect(pickHumanOwner([members[2]!], [])).toBe("m1");
  });
  it("ninguém ativo devolve null", () => {
    expect(pickHumanOwner([members[3]!], [])).toBeNull();
  });
});

it("prazo do humano", () => {
  expect(humanDueAt(new Date("2026-10-27T10:00:00Z"), 15).toISOString()).toBe(
    "2026-10-27T10:15:00.000Z",
  );
});

describe("prompt", () => {
  const base = {
    company: "Clínica Sol",
    agent: {
      name: "Bia",
      role: "sdr" as const,
      persona: "Consultora",
      tone: "cordial",
      goal: "Marcar avaliação",
      instructions: "Nunca fale de concorrente",
    },
    settings: {
      ...DEFAULT_SETTINGS,
      form_fields: [
        { key: "email", label: "e-mail", required: true },
        { key: "company", label: "empresa", required: false },
      ],
      survey: "nps" as const,
      policy: "Até 3x sem juros",
    },
    style: DEFAULT_STYLE,
    tone: { formal: true, short: false, usesEmoji: false },
    greeted: true,
    roster: [{ name: "Cobrança", role: "collection" as const }],
    contact: "Nome: Ana",
    kb: [{ title: "Horários", body: "Seg a sex" }],
    products: [{ name: "Avaliação", price: 150, billing: "one_time", description: null }],
    handoffSummary: "Quer saber preço",
    collected: { email: "a@b.com" },
    surveyPending: true,
    channel: "whatsapp",
    now: "27/10/2026 10:00",
  };
  it("leva contexto, regras, equipe e o que falta coletar", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("Clínica Sol");
    expect(p).toContain("não cumprimente de novo");
    expect(p).toContain("formalidade");
    expect(p).toContain("Até 3x sem juros");
    expect(p).toContain("Cobrança (Cobrança)");
    expect(p).toContain("Não peça ao cliente para repetir");
    expect(p).toContain("empresa (company)");
    expect(p).not.toContain("e-mail (email)");
    expect(p).toContain("de 0 a 10");
    expect(p).toContain("R$ 150,00 avulso");
  });
  it("primeira resposta pode cumprimentar e sem equipe manda para humano", () => {
    const p = buildSystemPrompt({ ...base, greeted: false, roster: [] });
    expect(p).toContain("Cumprimente uma vez");
    expect(p).toContain("passe para humano");
  });
});

describe("ferramentas", () => {
  it("route_to só existe com equipe e lista os nomes", () => {
    expect(controlTools([]).map((t) => t.name)).toEqual(["respond", "handoff_to_human"]);
    const route = controlTools([{ name: "Bia" }]).find((t) => t.name === "route_to")!;
    expect(JSON.stringify(route.parameters)).toContain("Bia");
  });
  it("só entram as ferramentas ligadas e disponíveis", () => {
    const specs = internalToolSpecs(["kb_search", "book", "inexistente"], new Set(["kb_search"]));
    expect(specs.map((s) => s.name)).toEqual(["kb_search"]);
  });
});
