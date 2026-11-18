import { describe, expect, it } from "vitest";

import { viewFilters } from "./api-views";
import { DEFAULT_FILTERS } from "./lib/filters";

describe("viewFilters", () => {
  it("devolve os filtros salvos", () => {
    expect(
      viewFilters({
        status: "pending",
        scope: "mine",
        unread: true,
        tag: "vip",
        platform: "whatsapp",
        search: "boleto",
      }),
    ).toEqual({
      status: "pending",
      scope: "mine",
      unread: true,
      tag: "vip",
      platform: "whatsapp",
      search: "boleto",
    });
  });

  it("valor estranho vindo do banco cai no padrão, nunca quebra a tela", () => {
    expect(viewFilters({ status: "apagado", scope: 3, unread: "sim", tag: 5 })).toEqual(
      DEFAULT_FILTERS,
    );
    expect(viewFilters(null)).toEqual(DEFAULT_FILTERS);
  });
});
