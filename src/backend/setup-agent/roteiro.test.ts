import { describe, expect, it } from "vitest";

import { opener, PLACEHOLDER_COMPANY, roteiroState, roteiroText } from "./roteiro";
import type { Fact, SetupSnapshot } from "./spec";

type Opened = ReturnType<typeof opener>;
const blocksOf = (o: Opened) => o.messages.flatMap((m) => m.blocks);
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
  firstWin: { received: false, replied: false, deal: false },
};
const fact = (key: string, category: string): Fact => ({ key, category, label: key, value: "x" });
const ready = { ...base, company: "Clínica Vita", segment: "clinica" };
const webchat = [{ platform: "webchat", name: "Chat do site" }];

describe("roteiroState", () => {
  it("conta recém-criada: 2 obrigatórios (empresa e canal) e começa pela empresa", () => {
    const r = roteiroState(base, []);
    expect(r.current?.id).toBe("empresa");
    expect(r.requiredPending).toBe(2);
    expect(r.steps.filter((s) => s.required).map((s) => s.id)).toEqual(["empresa", "canal"]);
  });

  it("empresa só fica pronta com nome de verdade e ramo (o nome provisório não vale)", () => {
    expect(roteiroState({ ...base, segment: "clinica" }, []).steps[0]?.done).toBe(false);
    expect(roteiroState(ready, []).steps[0]?.done).toBe(true);
  });

  it("qualquer canal ligado resolve o canal: o chat do site é a saída sem conta externa", () => {
    const r = roteiroState({ ...ready, channels: webchat }, []);
    expect(r.requiredPending).toBe(0);
    expect(r.current?.id).toBe("recursos");
  });

  it("depois do mínimo pergunta o que a empresa vai usar; a escolha (ou só o essencial) resolve", () => {
    const pending = roteiroState({ ...ready, channels: webchat }, []);
    expect(pending.current?.id).toBe("recursos");
    const chose = roteiroState({ ...ready, channels: webchat }, [
      fact("recursos_escolhidos", "outros"),
    ]);
    expect(chose.steps.find((st) => st.id === "recursos")?.done).toBe(true);
    expect(chose.current?.id).toBe("primeira_conversa");
    const viaAjustes = roteiroState({ ...ready, channels: webchat, modules: ["empresas"] }, []);
    expect(viaAjustes.steps.find((st) => st.id === "recursos")?.done).toBe(true);
  });

  it("o bloco de recursos lista os extras e a opção só o essencial, com escolha múltipla", () => {
    const o = opener({
      state: roteiroState({ ...ready, channels: webchat }, []),
      company: "Clínica Vita",
      person: "",
    });
    const choices = blocksOf(o).find((b) => b.kind === "choices");
    expect(choices?.kind === "choices" && choices.multiple).toBe(true);
    expect(choices?.kind === "choices" && choices.options.map((x) => x.label)).toContain(
      "Só o essencial",
    );
  });

  it("pular obrigatório fica gravado, mas o passo continua pendente e na frente", () => {
    const r = roteiroState(ready, [
      fact("pulou_canal", "outros"),
      fact("pulou_conhecimento", "outros"),
    ]);
    const canal = r.steps.find((s) => s.id === "canal")!;
    expect(canal.skipped).toBe(true);
    expect(canal.resolved).toBe(false);
    expect(r.requiredPending).toBe(1);
    expect(r.current?.id).toBe("canal");
  });

  it("pular opcional resolve: não volta a ser oferecido", () => {
    const r = roteiroState({ ...ready, channels: webchat }, [
      fact("recursos_escolhidos", "outros"),
      fact("pulou_primeira_conversa", "outros"),
      fact("pulou_conhecimento", "outros"),
    ]);
    expect(r.steps.find((s) => s.id === "conhecimento")?.resolved).toBe(true);
    expect(r.current?.id).toBe("voz");
  });

  it("agente só conta quando está ativo (passou na avaliação de 90%)", () => {
    const draft = roteiroState({ ...ready, agents: [{ name: "Ana", status: "draft" }] }, []);
    const on = roteiroState({ ...ready, agents: [{ name: "Ana", status: "active" }] }, []);
    expect(draft.steps.find((s) => s.id === "agente")?.done).toBe(false);
    expect(on.steps.find((s) => s.id === "agente")?.done).toBe(true);
  });
});

describe("abertura da conversa", () => {
  it("primeiro uso: diz que vão configurar juntos, mostra o roteiro e pede nome e ramo", () => {
    const o = opener({
      state: roteiroState(base, []),
      company: PLACEHOLDER_COMPANY,
      person: "Ana",
    });
    expect(textOf(o)).toMatch(/^Oi, Ana! Eu sou a Nexa\./);
    expect(textOf(o)).toContain("configurar a central juntos, conversando");
    expect(textOf(o)).toContain("tiro qualquer dúvida");
    expect(textOf(o)).toContain("Como se chama a empresa");
    // duas mensagens curtas: o cumprimento sem bloco e a pergunta só com os cartões do passo.
    // O roteiro inteiro não entra na conversa (fica na faixa de progresso da Nexa).
    expect(o.messages).toHaveLength(2);
    expect(o.messages[0]!.blocks).toEqual([]);
    expect(o.messages[0]!.text).not.toContain("?");
    expect(o.messages[1]!.blocks.map((b) => b.kind)).toEqual(["choices"]);
    expect(blocksOf(o).some((b) => b.kind === "steps" && b.title === "O roteiro")).toBe(false);
  });

  it("veio pelo /bem-vindo com nome: confirma o nome e pergunta só o ramo", () => {
    const o = opener({
      state: roteiroState({ ...base, company: "Clínica Vita" }, []),
      company: "Clínica Vita",
      person: "",
    });
    expect(textOf(o)).toContain("Vi que a empresa é Clínica Vita. Qual é o ramo de vocês?");
  });

  it("canal pendente oferece WhatsApp, chat do site e e-mail", () => {
    const o = opener({ state: roteiroState(ready, []), company: "Clínica Vita", person: "" });
    const choices = blocksOf(o).find((b) => b.kind === "choices");
    expect(choices?.kind === "choices" && choices.options.map((x) => x.label)).toEqual([
      "WhatsApp",
      "Chat do site",
      "E-mail",
    ]);
    expect(textOf(o)).toContain("falta 1 passo obrigatório");
  });

  it("tudo pronto: vira a conversa de ajuste, sem blocos", () => {
    const done = roteiroState(
      {
        ...ready,
        aiMode: "included",
        channels: [{ platform: "whatsapp", name: "x" }],
        agents: [{ name: "Ana", status: "active" }],
        team: 2,
        documents: 1,
        firstWin: { received: true, replied: true, deal: true },
        integrations: [
          { id: "resend", status: "connected" },
          { id: "zadarma", status: "connected" },
          { id: "elevenlabs", status: "connected" },
        ],
      },
      [fact("tom", "voz"), fact("recursos_escolhidos", "outros")],
    );
    expect(blocksOf(opener({ state: done, company: "Clínica Vita", person: "" }))).toEqual([]);
    expect(roteiroText(done)).toContain("Roteiro completo");
  });
});

describe("e-mail, telefonia e voz", () => {
  const base = { ...ready, channels: webchat };
  it("ficam prontos só com a integração conectada de verdade", () => {
    const off = roteiroState({ ...base, integrations: [{ id: "zadarma", status: "error" }] }, []);
    expect(off.steps.find((s) => s.id === "telefonia")?.done).toBe(false);
    const on = roteiroState(
      {
        ...base,
        integrations: [
          { id: "ses", status: "connected" },
          { id: "zadarma", status: "connected" },
          { id: "elevenlabs", status: "connected" },
        ],
      },
      [],
    );
    expect(
      ["email", "telefonia", "voz_ia"].map((id) => on.steps.find((s) => s.id === id)?.done),
    ).toEqual([true, true, true]);
  });
  it("são opcionais e não mexem no indicador do layout", () => {
    const r = roteiroState(base, []);
    for (const id of ["email", "telefonia", "voz_ia"])
      expect(r.steps.find((s) => s.id === id)?.required).toBe(false);
    expect(r.requiredPending).toBe(0);
  });
});

describe("primeira conversa (1ª vitória)", () => {
  const chosen = [fact("recursos_escolhidos", "outros")];
  const live = { ...ready, channels: webchat };

  it("vem logo depois do canal e dos recursos, é opcional e não mexe no indicador", () => {
    const r = roteiroState(live, chosen);
    expect(r.current?.id).toBe("primeira_conversa");
    expect(r.requiredPending).toBe(0);
    expect(r.steps.find((s) => s.id === "primeira_conversa")?.required).toBe(false);
  });

  it("só fica pronta com mensagem recebida, resposta e negócio, lidos do banco", () => {
    const partial = { ...live, firstWin: { received: true, replied: true, deal: false } };
    expect(
      roteiroState(partial, chosen).steps.find((s) => s.id === "primeira_conversa")?.done,
    ).toBe(false);
    const full = { ...live, firstWin: { received: true, replied: true, deal: true } };
    const r = roteiroState(full, chosen);
    expect(r.steps.find((s) => s.id === "primeira_conversa")?.done).toBe(true);
    expect(r.current?.id).toBe("conhecimento");
  });

  it("pular resolve, porque é opcional", () => {
    const r = roteiroState(live, [...chosen, fact("pulou_primeira_conversa", "outros")]);
    expect(r.current?.id).toBe("conhecimento");
  });

  it("a abertura mostra as três etapas da vitória", () => {
    const o = opener({ state: roteiroState(live, chosen), company: "Clínica Vita", person: "" });
    const steps = blocksOf(o).filter((b) => b.kind === "steps");
    expect(steps.some((b) => b.title === "A primeira vitória")).toBe(true);
  });
});
