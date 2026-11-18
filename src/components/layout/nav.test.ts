import { describe, expect, it } from "vitest";

import { EXTRA_MODULES } from "./modules";
import { CONFIG_GROUP, HELP_ITEM, HOME, NAV, navGroupsFor, navItemsFor } from "./nav";

const routes = (manager: boolean, modules?: Set<string>) =>
  navGroupsFor(manager, modules).flatMap((g) => g.items.map((i) => i.to));

describe("menu da central", () => {
  it("cada rota e cada atalho aparecem uma vez só", () => {
    expect(new Set(NAV.map((i) => i.to)).size).toBe(NAV.length);
    expect(new Set(NAV.map((i) => i.shortcut)).size).toBe(NAV.length);
  });

  it("todo mundo começa no Painel", () => {
    expect(HOME).toBe("/painel");
    expect(routes(false)[0]).toBe("/painel");
    expect(routes(true)[0]).toBe("/painel");
  });

  it("núcleo de quem atende: atender, vender e qualidade, nada de gestor", () => {
    expect(routes(false)).toEqual([
      "/painel",
      "/fila",
      "/inbox",
      "/ligacoes",
      "/atendimento",
      "/reunioes",
      "/crm",
      "/contatos",
      "/agenda",
      "/qualidade",
    ]);
  });

  it("gestor vê de onde vêm os leads logo no menu", () => {
    expect(routes(true)).toContain("/origem");
    expect(routes(false)).not.toContain("/origem");
  });

  it("extras ficam fora até o gestor ligar; ligados, aparecem", () => {
    const extras = NAV.filter((i) => i.module).map((i) => i.to);
    expect(extras).toEqual(expect.arrayContaining(["/campanhas", "/automacoes", "/meu-dia"]));
    for (const to of extras) expect(routes(true), to).not.toContain(to);
    const all = new Set(EXTRA_MODULES.map((m) => m.id));
    for (const to of extras) expect(routes(true, all), to).toContain(to);
  });

  it("todo extra do menu tem explicação em Recursos extras", () => {
    const ids = new Set(EXTRA_MODULES.map((m) => m.id));
    for (const i of NAV.filter((x) => x.module)) expect(ids.has(i.module!), i.to).toBe(true);
  });

  it("configuração fica no rodapé e é só do gestor", () => {
    for (const c of CONFIG_GROUP.items) {
      expect(c.manager, c.to).toBe(true);
      expect(routes(true), c.to).not.toContain(c.to);
    }
    expect(navItemsFor(false).map((i) => i.to)).toContain("/ajustes");
  });

  it("Ajuda fica ao alcance de todos os papéis (menu e ⌘K)", () => {
    expect(navItemsFor(false)).toContain(HELP_ITEM);
    expect(navItemsFor(true)).toContain(HELP_ITEM);
    expect(HELP_ITEM.manager).toBeUndefined();
  });

  it("menu padrão do gestor cabe numa olhada: no máximo 5 por grupo e 14 no total", () => {
    for (const g of navGroupsFor(true)) expect(g.items.length, g.label).toBeLessThanOrEqual(5);
    expect(routes(true).length).toBeLessThanOrEqual(14);
  });
});

describe("menu limpo no primeiro dia", () => {
  const paths = (c: ReadonlySet<string> | null) =>
    navGroupsFor(true, new Set(), c).flatMap((g) => g.items.map((i) => i.to));
  it("sem Zadarma e sem LiveKit, Ligações e Reuniões somem", () => {
    expect(paths(new Set())).not.toContain("/ligacoes");
    expect(paths(new Set())).not.toContain("/reunioes");
  });
  it("conectou, aparece; sem saber ainda (null), não esconde", () => {
    expect(paths(new Set(["zadarma"]))).toContain("/ligacoes");
    expect(paths(new Set(["livekit"]))).toContain("/reunioes");
    expect(paths(null)).toContain("/ligacoes");
  });
});
