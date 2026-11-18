import { describe, expect, it } from "vitest";

import { EDITION, FULL_EDITION } from "@/lib/edition";

import { AGENT_CHANNELS, INTERNAL_TOOLS, agentChannelsFor, internalToolsFor } from "./catalog";

describe("equipe de IA por edição", () => {
  it("edição atual: o agente só atende WhatsApp e Instagram", () => {
    expect(agentChannelsFor(EDITION).map((c) => c.id)).toEqual(["whatsapp", "instagram"]);
  });

  it("edição completa: todos os canais voltam", () => {
    expect(agentChannelsFor(FULL_EDITION)).toHaveLength(AGENT_CHANNELS.length);
  });

  it("ferramenta que exige o Asaas some da edição atual e volta na completa", () => {
    const hidden = INTERNAL_TOOLS.filter((t) => t.requires === "asaas").map((t) => t.slug);
    expect(hidden.length).toBeGreaterThan(0);
    const shown = internalToolsFor(EDITION).map((t) => t.slug);
    for (const slug of hidden) expect(shown).not.toContain(slug);
    expect(internalToolsFor(FULL_EDITION)).toHaveLength(INTERNAL_TOOLS.length);
  });
});
