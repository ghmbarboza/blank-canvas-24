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
    expect(r.guias.map((g) => g.slug)).toContain("whatsapp-qr-code");
    expect(r.faq.length).toBeGreaterThan(0);
  });

  it("busca sem resultado volta vazio", () => {
    const r = searchHelp("xyzzy inexistente");
    expect(r.faq).toHaveLength(0);
    expect(r.guias).toHaveLength(0);
  });

  it("slugs únicos e guia achado pelo slug", () => {
    expect(new Set(guias.map((g) => g.slug)).size).toBe(guias.length);
    expect(guideBySlug("whatsapp-qr-code")?.titulo).toBe("Conectar o WhatsApp por QR Code");
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

  it("WhatsApp por QR Code vem primeiro, sem jargão de servidor", () => {
    const all = JSON.stringify({ faq, guias });
    // a ajuda explica a conexão por QR Code, mas sem variável de ambiente nem marcas de terceiros
    expect(all).not.toMatch(
      new RegExp(["AUTHENTICATION_API_KEY", "Z" + "-API", "três jeitos"].join("|")),
    );
    expect(temas[0]?.guias).toEqual(["whatsapp-qr-code", "instagram"]);
    expect(GUIA_DO_PROVEDOR["evolution"]).toBe("whatsapp-qr-code");
    expect(GUIA_DO_PROVEDOR["zernio"]).toBe("instagram");
  });

  it("os guias essenciais do pós-venda existem, na ordem de quem está começando", () => {
    expect(guias.map((g) => g.slug)).toEqual([
      "whatsapp-qr-code",
      "instagram",
      "base-de-conhecimento",
      "atendente-de-ia",
      "regras-de-pos-venda",
      "caixa-de-entrada",
      "chamados",
      "pesquisa-de-satisfacao",
      "equipe-e-papeis",
    ]);
    expect(temas.map((t) => t.id)).toEqual(["canais", "agente", "posvenda", "atender", "equipe"]);
    expect(guideBySlug("regras-de-pos-venda")?.link?.to).toBe("/pos-venda");
  });

  it("só fala dos dois canais do produto: WhatsApp por QR Code e Instagram", () => {
    const all = JSON.stringify({ faq, guias, temas });
    expect(all).not.toMatch(
      /Messenger|Telegram|TikTok|LinkedIn|YouTube|Threads|Zadarma|ElevenLabs|LiveKit|Resend|OpenAI|Anthropic|Outlook|Microsoft|Google|chat do site|n[uú]mero oficial|WhatsApp Oficial|modelo aprovado|liga[cç][oõ]es|telefonia|\bSMS\b|campanha|funil|origem dos leads/i,
    );
    // a Zernio só aparece por causa do Instagram
    for (const g of guias)
      if (/zernio/i.test(JSON.stringify(g))) expect(g.slug, g.slug).toBe("instagram");
    for (const slug of ["whatsapp-oficial-zernio", "ligacoes-zadarma-elevenlabs", "chat-do-site"])
      expect(guideBySlug(slug), slug).toBeUndefined();
  });

  it("convite: link para copiar e mandar pelo WhatsApp, sem mandar configurar e-mail", () => {
    const guia = guideBySlug("equipe-e-papeis")?.passos.join(" ") ?? "";
    expect(guia).toMatch(/link/);
    expect(guia).toMatch(/WhatsApp/);
    expect(guia).not.toMatch(/vai por e-mail|sai por e-mail/);
  });

  it("texto sem travessão e sem o nome do produto antigo", () => {
    const all = JSON.stringify({ faq, guias, temas });
    expect(all).not.toMatch(/—|nexus|nexa|viver de ia/i);
  });

  it("FAQ cobre as dúvidas de quem está começando", () => {
    for (const termo of [
      "QR Code",
      "caiu",
      "Instagram",
      "convite",
      "chaves",
      "genérica",
      "tradução",
      "Refazer",
    ])
      expect(searchHelp(termo).faq.length, termo).toBeGreaterThan(0);
  });
});
