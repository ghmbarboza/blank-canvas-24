import { describe, expect, it } from "vitest";

import { extraModulesFor } from "@/components/layout/modules";
import { nodeTypeInEdition, paletteFor } from "@/features/automations/nodeMeta";
import { TEMPLATES, templatesFor } from "@/features/automations/templates";
import { eventInEdition } from "@/features/automations/triggerSummary";
import { timelineFiltersFor } from "@/features/contacts/components/detail/timeline-filters";

import {
  ALL_CHANNELS,
  EDITION,
  FULL_EDITION,
  hasChannel,
  hasPlatform,
  hasProvider,
  isRouteHidden,
} from "./edition";

describe("edição do produto", () => {
  it("os canais são WhatsApp por QR Code e Instagram, e nada mais", () => {
    expect([...EDITION.channels].sort()).toEqual(["instagram", "whatsapp_qr"]);
    expect(EDITION.ownAiKey).toBe(false);
    expect(EDITION.allIntegrations).toBe(false);
    for (const c of ALL_CHANNELS) expect(hasChannel(c, FULL_EDITION), c).toBe(true);
  });

  it("só aparecem as integrações que os canais precisam", () => {
    expect(hasProvider("evolution")).toBe(true);
    expect(hasProvider("zernio")).toBe(true);
    for (const id of ["resend", "ses", "zadarma", "elevenlabs", "livekit", "deepgram", "asaas"])
      expect(hasProvider(id), id).toBe(false);
    expect(hasProvider("zernio", { ...EDITION, channels: ["whatsapp_qr"] })).toBe(false);
    expect(hasProvider("asaas", FULL_EDITION)).toBe(true);
  });

  it("plataformas de conversa: WhatsApp e Instagram ficam, as outras somem", () => {
    expect(hasPlatform("whatsapp")).toBe(true);
    expect(hasPlatform("instagram")).toBe(true);
    for (const p of ["facebook", "telegram", "tiktok", "x", "linkedin", "webchat", "email", "sms"])
      expect(hasPlatform(p), p).toBe(false);
    expect(hasPlatform("facebook", FULL_EDITION)).toBe(true);
  });

  it("telas dos canais ausentes saem do ar; o núcleo continua", () => {
    for (const p of [
      "/ligacoes",
      "/ligacoes/discador",
      "/reunioes/abc",
      "/campanhas",
      "/campanhas/modelos",
      "/campanhas/whatsapp",
      "/biblioteca",
    ])
      expect(isRouteHidden(p), p).toBe(true);
    for (const p of ["/painel", "/inbox/1", "/canais", "/automacoes", "/pos-venda", "/agenda"])
      expect(isRouteHidden(p), p).toBe(false);
    expect(isRouteHidden("/ligacoes", FULL_EDITION)).toBe(false);
    expect(isRouteHidden("/campanhas/whatsapp", FULL_EDITION)).toBe(false);
    // e-mail de volta: campanhas de e-mail abrem, as de WhatsApp oficial continuam fora
    const withEmail = { ...EDITION, channels: [...EDITION.channels, "email" as const] };
    expect(isRouteHidden("/campanhas", withEmail)).toBe(false);
    expect(isRouteHidden("/campanhas/whatsapp", withEmail)).toBe(true);
  });

  it("recursos extras: Campanhas de e-mail e Biblioteca não são oferecidos", () => {
    const ids = extraModulesFor().map((m) => m.id);
    expect(ids).not.toContain("campanhas");
    expect(ids).not.toContain("biblioteca");
    expect(ids).toEqual(expect.arrayContaining(["meu_dia", "automacoes", "gestao"]));
    expect(extraModulesFor(FULL_EDITION).map((m) => m.id)).toEqual(
      expect.arrayContaining(["campanhas", "biblioteca"]),
    );
  });

  it("automações: só passos que não exigem outro canal", () => {
    const types = paletteFor().flatMap((g) => g.types);
    for (const t of ["email", "sms", "voice_call", "composio_action", "webhook"] as const) {
      expect(types, t).not.toContain(t);
      expect(nodeTypeInEdition(t, FULL_EDITION), t).toBe(true);
    }
    expect(types).toEqual(
      expect.arrayContaining([
        "whatsapp",
        "task",
        "ticket",
        "notify",
        "ai_agent",
        "move_stage",
        "add_tag",
        "wait",
        "condition",
      ]),
    );
    expect(paletteFor().map((g) => g.group)).not.toContain("Equipe de IA e apps");
    expect(paletteFor(FULL_EDITION).flatMap((g) => g.types)).toContain("email");
    expect(eventInEdition("email.opened")).toBe(false);
    expect(eventInEdition("call.ended")).toBe(false);
    expect(eventInEdition("deal.won")).toBe(true);
    expect(eventInEdition("email.opened", FULL_EDITION)).toBe(true);
  });

  it("modelos prontos que usam e-mail, SMS ou ligação não aparecem na galeria", () => {
    for (const t of templatesFor())
      for (const n of Object.values(t.graph.nodes))
        expect(["email", "sms", "voice_call"], `${t.key}/${n.id}`).not.toContain(n.type);
    expect(templatesFor(FULL_EDITION)).toHaveLength(TEMPLATES.length);
  });

  it("linha do tempo do contato: sem filtro de e-mail e de ligação", () => {
    const ids = timelineFiltersFor().map((f) => f.id);
    expect(ids).not.toContain("email");
    expect(ids).not.toContain("calls");
    expect(ids).toContain("messages");
    expect(timelineFiltersFor(FULL_EDITION).map((f) => f.id)).toContain("calls");
  });
});
