import { describe, expect, it } from "vitest";

import {
  isDone,
  MAIN_STEPS,
  opener,
  PLACEHOLDER_COMPANY,
  ROTEIRO,
  roteiroFor,
  roteiroState,
  roteiroText,
} from "./roteiro";
import {
  setupSystem,
  SETUP_TOOLS,
  setupToolsFor,
  toolInEdition,
  zernioOptionAllowed,
  type Fact,
  type SetupSnapshot,
} from "./spec";
import { EDITION, FULL_EDITION, type Edition } from "@/lib/edition";

/** A edição do produto hoje: WhatsApp por QR Code e Instagram. */
const WA_ONLY: Edition = { channels: ["whatsapp_qr"], ownAiKey: false, allIntegrations: false };

type Opened = ReturnType<typeof opener>;
const blocksOf = (o: Opened) => o.messages.flatMap((m) => m.blocks);
const actionsOf = (o: Opened) => o.messages.flatMap((m) => m.actions ?? []);
const textOf = (o: Opened) => o.messages.map((m) => m.text).join("\n\n");

const base: SetupSnapshot = {
  company: PLACEHOLDER_COMPANY,
  segment: null,
  ai: "IA inclusa da plataforma",
  aiMode: null,
  integrations: [],
  channels: [],
  agents: [],
  team: 1,
  documents: 0,
  wishes: 0,
  modules: [],
  rulesOn: 0,
  firstWin: { received: false, replied: false, deal: false },
};
const fact = (key: string, category: string): Fact => ({ key, category, label: key, value: "x" });
const ready = { ...base, company: "Loja Vita", segment: "varejo" };
const whatsapp = [{ platform: "whatsapp", name: "WhatsApp" }];
const live = { ...ready, channels: whatsapp };
const step = (r: ReturnType<typeof roteiroState>, id: string) => r.steps.find((s) => s.id === id)!;

describe("roteiro da edição de pós-venda", () => {
  it("são seis passos principais, nesta ordem, e o resto fica em depois", () => {
    expect(MAIN_STEPS).toEqual(["empresa", "canal", "conhecimento", "agente", "regras", "teste"]);
    expect(ROTEIRO.filter((s) => s.later).map((s) => s.id)).toEqual(["equipe", "instagram"]);
    expect(ROTEIRO.filter((s) => s.required).map((s) => s.id)).toEqual(["empresa", "canal"]);
  });

  it("depois, se quiser: só o que a edição tem (sem e-mail; Instagram só com o canal)", () => {
    const later = (e: Edition) =>
      roteiroFor(e)
        .filter((s) => s.later)
        .map((s) => s.id);
    expect(later(EDITION)).toEqual(["equipe", "instagram"]);
    expect(later(WA_ONLY)).toEqual(["equipe"]);
    expect(later(FULL_EDITION)).toEqual(["equipe", "instagram", "email"]);
  });

  it("o roteiro da edição não cita outro canal nem outra integração", () => {
    const all = JSON.stringify(ROTEIRO);
    expect(all).not.toMatch(/Resend|número oficial|link_whatsapp|conectar_integracao|telefon|SMS/i);
    expect(all).not.toMatch(/por e-mail/);
    const canal = (e: Edition) => roteiroFor(e).find((s) => s.id === "canal")!.goal;
    expect(canal(EDITION)).not.toContain("Zernio");
    expect(canal(FULL_EDITION)).toContain("número oficial da Meta");
    // o convite sai por link: o passo não manda configurar e-mail
    const equipe = ROTEIRO.find((s) => s.id === "equipe")!;
    expect(`${equipe.summary} ${equipe.goal}`).toContain("link");
    expect(equipe.goal).toContain("não precisa configurar e-mail");
  });

  it("nenhum texto do roteiro fala da marca antiga nem usa travessão", () => {
    const all = JSON.stringify(roteiroFor(FULL_EDITION));
    expect(all).not.toMatch(/Nexa|Nexus|Viver de IA|—/);
    expect(all).not.toMatch(/não oficia(l|is) de WhatsApp não são suportadas/);
  });

  it("conta recém-criada: 2 obrigatórios e começa pela empresa", () => {
    const r = roteiroState(base, []);
    expect(r.current?.id).toBe("empresa");
    expect(r.requiredPending).toBe(2);
    expect(r.mainTotal).toBe(6);
    expect(r.mainDone).toBe(0);
  });
});

describe("isDone de cada passo", () => {
  it("empresa: só com nome de verdade e ramo (o nome provisório não vale)", () => {
    expect(isDone("empresa", { ...base, segment: "varejo" })).toBe(false);
    expect(isDone("empresa", { ...base, company: "Loja Vita" })).toBe(false);
    expect(isDone("empresa", ready)).toBe(true);
  });

  it("canal: precisa de um WhatsApp conectado; chat do site sozinho não resolve", () => {
    expect(isDone("canal", { ...ready, channels: [{ platform: "webchat", name: "Chat" }] })).toBe(
      false,
    );
    expect(isDone("canal", live)).toBe(true);
  });

  it("conhecimento: pelo menos um documento lido na base", () => {
    expect(isDone("conhecimento", live, [fact("servicos", "produtos"), fact("x", "vendas")])).toBe(
      false,
    );
    expect(isDone("conhecimento", { ...live, documents: 1 })).toBe(true);
  });

  it("agente: conta atendente criado, mesmo ainda desligado; supervisor não conta", () => {
    const draft = { ...live, agents: [{ name: "Pós-venda", status: "draft", role: "post_sale" }] };
    const sup = { ...live, agents: [{ name: "Supervisor", status: "active", role: "supervisor" }] };
    const on = { ...live, agents: [{ name: "Pós-venda", status: "active", role: "post_sale" }] };
    expect(isDone("agente", draft)).toBe(true);
    expect(isDone("agente", sup)).toBe(false);
    expect(isDone("agente", on)).toBe(true);
  });

  it("regras: pelo menos uma regra de pós-venda ligada", () => {
    expect(isDone("regras", live)).toBe(false);
    expect(isDone("regras", { ...live, rulesOn: 1 })).toBe(true);
  });

  it("teste: mensagem recebida e resposta enviada, sem exigir negócio", () => {
    const got = { ...live, firstWin: { received: true, replied: false, deal: false } };
    const both = { ...live, firstWin: { received: true, replied: true, deal: false } };
    expect(isDone("teste", got)).toBe(false);
    expect(isDone("teste", both)).toBe(true);
  });

  it("depois: Instagram fica pronto com o canal do Instagram conectado", () => {
    expect(isDone("instagram", live)).toBe(false);
    expect(
      isDone("instagram", {
        ...live,
        channels: [...whatsapp, { platform: "instagram", name: "@lojavita" }],
      }),
    ).toBe(true);
    const r = roteiroState(live, []);
    expect(step(r, "instagram").later).toBe(true);
    // opcional: nunca vira o passo atual nem entra na conta do que falta
    expect(r.current?.id).not.toBe("instagram");
    expect(roteiroState(live, [], WA_ONLY).steps.map((s) => s.id)).not.toContain("instagram");
  });

  it("depois: equipe com mais de uma pessoa e e-mail com a integração conectada", () => {
    expect(isDone("equipe", { ...live, team: 2 })).toBe(true);
    expect(isDone("email", { ...live, integrations: [{ id: "resend", status: "error" }] })).toBe(
      false,
    );
    expect(
      isDone("email", { ...live, integrations: [{ id: "resend", status: "connected" }] }),
    ).toBe(true);
  });
});

describe("roteiroState", () => {
  it("com empresa e WhatsApp o mínimo está pronto e o próximo é a base de conhecimento", () => {
    const r = roteiroState(live, []);
    expect(r.requiredPending).toBe(0);
    expect(r.current?.id).toBe("conhecimento");
    expect(r.mainDone).toBe(2);
    expect(r.remaining).toBe(4);
  });

  it("pular obrigatório fica gravado, mas o passo continua pendente e na frente", () => {
    const r = roteiroState(ready, [fact("pulou_canal", "outros")]);
    expect(step(r, "canal").skipped).toBe(true);
    expect(step(r, "canal").resolved).toBe(false);
    expect(r.requiredPending).toBe(1);
    expect(r.current?.id).toBe("canal");
  });

  it("pular opcional resolve: não volta a ser oferecido", () => {
    const r = roteiroState(live, [fact("pulou_conhecimento", "outros")]);
    expect(step(r, "conhecimento").resolved).toBe(true);
    expect(r.current?.id).toBe("agente");
  });

  it("passos de depois nunca viram o passo atual nem entram na conta", () => {
    const done = roteiroState(
      {
        ...live,
        documents: 2,
        rulesOn: 3,
        agents: [{ name: "Pós-venda", status: "active", role: "post_sale" }],
        firstWin: { received: true, replied: true, deal: false },
      },
      [],
    );
    expect(done.current).toBeNull();
    expect(done.remaining).toBe(0);
    expect(done.mainDone).toBe(6);
    expect(step(done, "equipe").done).toBe(false);
    expect(roteiroText(done)).toContain("Roteiro completo");
    expect(blocksOf(opener({ state: done, company: "Loja Vita", person: "" }))).toEqual([]);
  });
});

describe("abertura da conversa", () => {
  it("primeiro uso: a Vi se apresenta, fala dos 6 passos e pede nome e ramo", () => {
    const o = opener({
      state: roteiroState(base, []),
      company: PLACEHOLDER_COMPANY,
      person: "Ana",
    });
    expect(textOf(o)).toMatch(/^Oi, Ana! Eu sou a Vi\./);
    expect(textOf(o)).toContain("6 passos");
    expect(textOf(o)).toContain("Como se chama a empresa");
    expect(o.messages).toHaveLength(2);
    expect(o.messages[0]!.blocks).toEqual([]);
    expect(o.messages[1]!.blocks.map((b) => b.kind)).toEqual(["choices"]);
  });

  it("toda abertura de passo traz o botão que abre a tela dele", () => {
    const o = opener({ state: roteiroState(ready, []), company: "Loja Vita", person: "" });
    expect(actionsOf(o)).toEqual([
      {
        kind: "open",
        label: "Fazer pela tela: Conectar o WhatsApp",
        to: "passo:canal",
        tool: "abrir_passo",
      },
    ]);
    expect(textOf(o)).toContain("falta 1 passo obrigatório");
  });

  it("canal pendente mostra o caminho do QR Code, não a Zernio", () => {
    const o = opener({ state: roteiroState(ready, []), company: "Loja Vita", person: "" });
    const steps = blocksOf(o).find((b) => b.kind === "steps");
    expect(steps?.kind === "steps" && steps.title).toBe("WhatsApp por QR Code");
    expect(JSON.stringify(o)).not.toContain("Zernio");
  });

  it("veio pelo /bem-vindo com nome: confirma o nome e pergunta só o ramo", () => {
    const o = opener({
      state: roteiroState({ ...base, company: "Loja Vita" }, []),
      company: "Loja Vita",
      person: "",
    });
    expect(textOf(o)).toContain("Vi que a empresa é Loja Vita. Qual é o ramo de vocês?");
  });

  it("refazer: recomeça pela empresa", () => {
    const o = opener({
      state: roteiroState(live, []),
      company: "Loja Vita",
      person: "",
      restart: true,
    });
    expect(textOf(o)).toContain("rever a configuração do começo");
    expect(actionsOf(o)[0]?.to).toBe("passo:empresa");
  });
});

describe("prompt e ferramentas da Vi", () => {
  const system = setupSystem({
    snapshot: live,
    facts: [],
    person: "Ana",
    today: "18/11/2026",
    stage: true,
    roteiro: roteiroText(roteiroState(live, [])),
  });

  it("fala de pós-venda, da marca nova e do QR Code pela Evolution", () => {
    expect(system).toContain("Você é a Vi");
    expect(system).toContain("Vínculo");
    expect(system).toContain("pós-venda");
    expect(system).toContain("Evolution");
    expect(system).not.toMatch(/Nexa|Nexus|Viver de IA|—/);
  });

  it("só fala de WhatsApp por QR Code e Instagram, e de nada mais", () => {
    expect(system).toContain("WhatsApp por QR Code e Instagram, e nada mais");
    expect(system).toContain("link_zernio");
    expect(system).not.toMatch(/número oficial|link_whatsapp|conectar_integracao|Resend/);
    const waOnly = setupSystem({
      snapshot: live,
      facts: [],
      person: "Ana",
      today: "18/11/2026",
      edition: WA_ONLY,
    });
    expect(waOnly).toContain("só o WhatsApp por QR Code");
    expect(waOnly).not.toMatch(/Instagram|Zernio/);
    const full = setupSystem({
      snapshot: live,
      facts: [],
      person: "Ana",
      today: "18/11/2026",
      edition: FULL_EDITION,
    });
    expect(full).toContain("número oficial da Meta");
    expect(full).toContain("conectar_integracao");
    expect(full).not.toMatch(/—/);
  });

  it("o modelo só recebe as ferramentas da edição", () => {
    const names = (e: Edition) => setupToolsFor(e).map((t) => t.name);
    const hidden = [
      "criar_chat_do_site",
      "escolher_ia",
      "conectar_integracao",
      "link_whatsapp",
      "link_ferramenta",
      "importar_drive",
    ];
    for (const n of hidden) {
      expect(names(EDITION), n).not.toContain(n);
      expect(toolInEdition(n), n).toBe(false);
      expect(names(FULL_EDITION), n).toContain(n);
    }
    // Instagram passa pela Zernio: a chave e o botão de conectar continuam
    for (const n of ["conectar_zernio", "conferir_zernio", "link_zernio"]) {
      expect(names(EDITION), n).toContain(n);
      expect(names(WA_ONLY), n).not.toContain(n);
    }
    expect(names(EDITION)).toEqual(SETUP_TOOLS.map((t) => t.name));
    const text = JSON.stringify(SETUP_TOOLS);
    expect(text).not.toMatch(
      /Messenger|Telegram|TikTok|LinkedIn|anúncio|Resend|Zadarma|LiveKit|ElevenLabs|Composio|chat do site|número oficial/i,
    );
    expect(text).not.toContain("campanhas");
    expect(JSON.stringify(setupToolsFor(FULL_EDITION))).toContain("campanhas");
  });

  it("pela Zernio só se conecta o que a edição oferece", () => {
    expect(zernioOptionAllowed("instagram")).toBe(true);
    for (const id of ["whatsapp", "facebook", "telegram", "metaads", "googlebusiness"]) {
      expect(zernioOptionAllowed(id), id).toBe(false);
      expect(zernioOptionAllowed(id, FULL_EDITION), id).toBe(true);
    }
  });

  it("tem a ferramenta que abre a tela de cada passo principal", () => {
    const tool = SETUP_TOOLS.find((t) => t.name === "abrir_passo");
    const passos = (tool?.parameters as { properties: { passo: { enum: string[] } } }).properties
      .passo.enum;
    expect(passos).toEqual(MAIN_STEPS);
    expect(JSON.stringify(SETUP_TOOLS)).not.toMatch(/Nexa|Nexus|Viver de IA|—/);
  });
});
