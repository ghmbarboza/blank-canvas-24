import { describe, expect, it } from "vitest";

import { voicePersona } from "./voice-persona";

describe("voicePersona", () => {
  const team = {
    name: "Bia",
    role: "sdr",
    persona: "Consultora",
    tone: "cordial",
    goal: "Marcar avaliação",
    instructions: "Não fale de concorrente",
    settings: { policy: "Até 3x sem juros" },
  };
  it("leva quem é, objetivo, regras e política para a voz", () => {
    const p = voicePersona(team, [], []);
    expect(p.promptPrefix).toContain("Consultora");
    expect(p.promptPrefix).toContain("Marcar avaliação");
    expect(p.promptPrefix).toContain("Não fale de concorrente");
    expect(p.promptPrefix).toContain("Até 3x sem juros");
    expect(p.promptPrefix).toContain("mesma pessoa");
  });
  it("traduz as ferramentas da equipe sem duplicar e sempre passa para a equipe", () => {
    const p = voicePersona(
      team,
      ["identify_contact", "availability", "book", "reschedule", "kb_search"],
      ["book"],
    );
    expect(p.tools.sort()).toEqual(["book", "crm_lookup", "route_to_queue", "slots"]);
  });
});
