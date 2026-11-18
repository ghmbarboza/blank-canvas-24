import { describe, expect, it } from "vitest";

import { GUIA_DO_PROVEDOR, faq, guias, guideBySlug, matches, searchHelp, temas } from "./content";

describe("central de ajuda do operador", () => {
  it("busca vazia mostra tudo", () => {
    const r = searchHelp("   ");
    expect(r.faq).toHaveLength(faq.length);
    expect(r.guias).toHaveLength(guias.length);
  });

  it("ignora acento e caixa", () => {
    expect(matches("CONVITE nao chegou", "O convite não chegou por e-mail")).toBe(true);
  });

  it("todas as palavras precisam aparecer", () => {
    expect(matches("whatsapp convite", "Conectar o WhatsApp")).toBe(false);
  });

  it("acha FAQ e guia pelo assunto", () => {
    const r = searchHelp("QR");
    expect(r.guias.map((g) => g.slug)).toContain("whatsapp-outras-formas");
    expect(r.faq.length).toBeGreaterThan(0);
  });

  it("busca sem resultado volta vazio", () => {
    const r = searchHelp("xyzzy inexistente");
    expect(r.faq).toHaveLength(0);
    expect(r.guias).toHaveLength(0);
  });

  it("slugs únicos e guia achado pelo slug", () => {
    expect(new Set(guias.map((g) => g.slug)).size).toBe(guias.length);
    expect(guideBySlug("chat-do-site")?.titulo).toBe("Colocar o chat no site");
    expect(guideBySlug("nao-existe")).toBeUndefined();
  });

  it("nunca manda guardar chave no Lovable", () => {
    const all = JSON.stringify({ faq, guias });
    expect(all).not.toMatch(/Cloud\\s*→\\s*Secrets|Lovable Cloud\\s*>\\s*Secrets/);
    expect(all).toMatch(/Ajustes › Integrações/);
  });

  it("todo guia está num tema da página e todo atalho de provedor aponta para guia real", () => {
    const nosTemas = temas.flatMap((t) => t.guias);
    for (const g of guias) expect(nosTemas).toContain(g.slug);
    for (const slug of [...nosTemas, ...Object.values(GUIA_DO_PROVEDOR)])
      expect(guideBySlug(slug)).toBeDefined();
  });

  it("WhatsApp: QR Code é o caminho da edição de pós-venda, sem jargão de servidor", () => {
    const all = JSON.stringify({ faq, guias });
    // a ajuda explica a conexão por QR Code, mas sem variável de ambiente nem marcas de terceiros
    expect(all).not.toMatch(
      new RegExp(["AUTHENTICATION_API_KEY", "Z" + "-API", "três jeitos"].join("|")),
    );
    expect(temas.find((t) => t.id === "whatsapp")?.guias[0]).toBe("whatsapp-oficial-zernio");
    expect(guideBySlug("whatsapp-meta-direta")).toBeUndefined();
    expect(guideBySlug("whatsapp-qr-evolution")).toBeUndefined();
  });

  it("tem guia de Ligações e de Campanhas de WhatsApp", () => {
    expect(guideBySlug("ligacoes-zadarma-elevenlabs")?.passos.join(" ")).toMatch(/ElevenLabs/);
    expect(guideBySlug("campanha-whatsapp")?.passos.join(" ")).toMatch(/Agendar/);
    expect(guideBySlug("campanha-whatsapp")?.link?.to).toBe("/campanhas/whatsapp");
  });

  it("FAQ cobre as dúvidas das mentorias", () => {
    for (const termo of [
      "não oficial",
      "outra ferramenta",
      "convite",
      "IA própria",
      "tradução",
      "chaves",
      "Refazer",
    ])
      expect(searchHelp(termo).faq.length, termo).toBeGreaterThan(0);
  });
});
