import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXTRA_MODULES } from "./modules";
import { POS_VENDA_DEFAULT_MODULES } from "@/features/posvenda/journey";

import {
  CONFIG_GROUP,
  HELP_ITEM,
  HOME,
  NAV,
  groupLabelFor,
  navGroupsFor,
  navItemsFor,
} from "./nav";

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

  it("núcleo de quem atende: atender, clientes e qualidade, nada de gestor", () => {
    expect(routes(false)).toEqual([
      "/painel",
      "/inbox",
      "/fila",
      "/atendimento",
      "/ligacoes",
      "/reunioes",
      "/contatos",
      "/crm",
      "/agenda",
      "/qualidade",
    ]);
  });

  it("gestor tem as Regras de pós-venda no menu, sem ligar nada", () => {
    expect(routes(true)).toContain("/pos-venda");
    expect(routes(false)).not.toContain("/pos-venda");
  });

  it("o que é de venda fica fora do menu até ligar a Captação de leads", () => {
    const sales = ["/origem", "/formularios", "/sdr", "/metas", "/treino"];
    for (const to of sales) expect(routes(true), to).not.toContain(to);
    expect(navItemsFor(true).map((i) => i.to)).not.toContain("/sdr");
    expect(routes(true, new Set(["captacao"]))).toEqual(
      expect.arrayContaining(["/origem", "/formularios", "/sdr"]),
    );
  });

  it("conta nova (meu_dia, automacoes, gestao): menu de pós-venda completo", () => {
    const groups = navGroupsFor(true, new Set(POS_VENDA_DEFAULT_MODULES));
    expect(groups.map((g) => g.label)).toEqual([
      "Início",
      "Atender",
      "Clientes",
      "Pós-venda",
      "Resultados",
      "Equipe",
    ]);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.to)]));
    expect(byLabel["Clientes"]).toEqual(["/contatos", "/crm", "/gestao", "/agenda"]);
    expect(byLabel["Pós-venda"]).toEqual(["/pos-venda", "/automacoes", "/campanhas/whatsapp"]);
    for (const g of groups) expect(g.items.length, g.label).toBeLessThanOrEqual(5);
  });

  it("cada item do menu aponta para uma rota que existe", () => {
    const tree = readFileSync(join(process.cwd(), "src/routeTree.gen.ts"), "utf8");
    for (const i of NAV) expect(tree, String(i.to)).toContain(`'${String(i.to)}'`);
  });

  it("nenhum texto do menu fala o nome do produto antigo", () => {
    for (const i of NAV) expect(i.label).not.toMatch(/nexus|nexa/i);
    expect(groupLabelFor("/rota-que-nao-existe")).toBe("Vínculo");
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
