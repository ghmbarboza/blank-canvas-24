import { describe, expect, it } from "vitest";

import { chapters, compileSoul, currentChapter } from "./soul";
import type { SetupSnapshot } from "./spec";

const snap: SetupSnapshot = {
  company: "Clínica Vita",
  segment: null,
  ai: "IA inclusa da plataforma",
  aiMode: null,
  integrations: [
    { id: "resend", status: "connected" },
    { id: "zernio", status: "error" },
  ],
  channels: [],
  agents: [],
  team: 1,
  documents: 0,
  wishes: 0,
  modules: [],
  firstWin: { received: false, replied: false, deal: false },
};

describe("capítulos da alma", () => {
  it("conta pelo que foi dito e pelo que já está configurado", () => {
    const list = chapters([{ category: "clientes" }, { category: "vendas" }], {
      ...snap,
      segment: "clinica",
    });
    expect(list.filter((c) => c.done).map((c) => c.id)).toEqual([
      "identidade",
      "clientes",
      "oferta",
    ]);
    expect(currentChapter(list)?.id).toBe("voz");
  });

  it("com tudo feito, o atual é o último", () => {
    const all = ["empresa", "clientes", "produtos", "voz", "canais", "regras"].map((category) => ({
      category,
    }));
    expect(currentChapter(chapters(all, null))?.id).toBe("equipe");
  });
});

describe("compileSoul", () => {
  it("separa por capítulo, guarda o resto em others e só nomeia integração conectada", () => {
    const soul = compileSoul({
      snapshot: snap,
      facts: [
        { key: "horario", category: "atendimento", label: "Horário", value: "8h às 18h" },
        { key: "tom", category: "voz", label: "Tom", value: "acolhedor" },
        { key: "x", category: "outros", label: "X", value: "y" },
      ],
      documents: [{ name: "precos.pdf", source: "upload", chunks: 3 }],
      wishes: [],
      now: new Date("2026-10-28T12:00:00Z"),
    });
    expect(soul.version).toBe(1);
    expect(Object.keys(soul.chapters.voz.facts)).toEqual(["horario", "tom"]);
    expect(soul.others).toEqual({ x: { label: "X", value: "y" } });
    expect(soul.setup.integrations).toEqual(["resend"]);
    expect(soul.progress).toEqual({ done: 1, total: 6 });
    expect(JSON.stringify(soul)).not.toMatch(/api_key|secret/i);
  });
});
