import { describe, expect, it } from "vitest";

import type { Channel, InboxItem } from "../types";
import { isAiActive } from "./ai";
import { DEFAULT_FILTERS, applyFilters, countByScope, tagsOf } from "./filters";

function item(id: string, patch: Partial<InboxItem["conversation"]> = {}): InboxItem {
  return {
    contact: null,
    conversation: {
      account_id: "a",
      ai_enabled: true,
      ai_handoff_at: null,
      ai_handoff_reason: null,
      assignee_user_id: null,
      avatar_url: null,
      channel_id: "ch",
      contact_id: null,
      created_at: "2026-10-01T00:00:00Z",
      external_thread_id: id,
      id,
      is_group: false,
      last_inbound_at: null,
      last_message_at: "2026-10-01T00:00:00Z",
      last_message_preview: null,
      snoozed_until: null,
      status: "open",
      tags: [],
      title: id,
      unread_count: 0,
      updated_at: "2026-10-01T00:00:00Z",
      ...patch,
    },
  };
}

const channels = new Map([["ch", { id: "ch", platform: "whatsapp", ai_enabled: true } as Channel]]);

describe("recorte por dono", () => {
  const items = [
    item("ia"),
    item("assumida", { ai_handoff_at: "2026-10-02T00:00:00Z", assignee_user_id: "u1" }),
    item("desligada", { ai_enabled: false, assignee_user_id: "u2" }),
  ];

  it("IA atendendo mostra só conversa com IA ligada e sem passagem para a equipe", () => {
    const r = applyFilters(items, { ...DEFAULT_FILTERS, scope: "ai" }, "u1", channels);
    expect(r.map((i) => i.conversation.id)).toEqual(["ia"]);
  });

  it("sem dono e minhas usam o responsável", () => {
    expect(
      applyFilters(items, { ...DEFAULT_FILTERS, scope: "unassigned" }, "u1", channels).map(
        (i) => i.conversation.id,
      ),
    ).toEqual(["ia"]);
    expect(
      applyFilters(items, { ...DEFAULT_FILTERS, scope: "mine" }, "u1", channels).map(
        (i) => i.conversation.id,
      ),
    ).toEqual(["assumida"]);
  });

  it("conta cada recorte na situação escolhida", () => {
    expect(countByScope(items, "open", "u1", channels)).toEqual({
      all: 3,
      mine: 1,
      unassigned: 1,
      ai: 1,
    });
  });

  it("canal com IA desligada nunca conta como IA atendendo", () => {
    expect(isAiActive(item("x").conversation, { ai_enabled: false })).toBe(false);
  });
});

describe("busca no texto das mensagens", () => {
  it("acha a conversa cuja mensagem casou, mesmo sem casar nome nem prévia", () => {
    const items = [item("a"), item("b")];
    const f = { ...DEFAULT_FILTERS, search: "boleto vencido" };
    expect(applyFilters(items, f, null, new Map()).map((i) => i.conversation.id)).toEqual([]);
    expect(
      applyFilters(items, f, null, new Map(), new Set(["b"])).map((i) => i.conversation.id),
    ).toEqual(["b"]);
  });

  it("os outros filtros continuam valendo para quem casou pelo texto", () => {
    const items = [item("a", { status: "closed" })];
    const f = { ...DEFAULT_FILTERS, search: "boleto" };
    expect(applyFilters(items, f, null, new Map(), new Set(["a"]))).toEqual([]);
  });
});

describe("filtro por etiqueta", () => {
  it("mostra só as conversas com a etiqueta escolhida", () => {
    const items = [item("a", { tags: ["vip"] }), item("b", { tags: [] })];
    const f = { ...DEFAULT_FILTERS, tag: "vip" };
    expect(applyFilters(items, f, null, new Map()).map((i) => i.conversation.id)).toEqual(["a"]);
  });
});

describe("tagsOf", () => {
  it("junta as etiquetas das conversas, sem repetir, em ordem alfabética", () => {
    expect(tagsOf([item("a", { tags: ["vip", "boleto"] }), item("b", { tags: ["vip"] })])).toEqual([
      "boleto",
      "vip",
    ]);
  });
});
