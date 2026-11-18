import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Todo `upsert` aponta para um índice único que o Postgres consegue INFERIR.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O DEFEITO (trazido do Gestor de Tráfego, onde aconteceu quatro vezes)
 *
 * O Postgres só infere um índice único PARCIAL quando a instrução repete o
 * predicado do índice (`on conflict (...) where ...`), e nunca infere um índice
 * sobre EXPRESSÃO a partir de uma lista de colunas. O PostgREST — que é quem o
 * `upsert` do supabase-js usa — manda só a lista de colunas. O resultado:
 *
 *     ERROR: there is no unique or exclusion constraint matching the
 *            ON CONFLICT specification                              (42P10)
 *
 * **Não é um erro que aparece.** O `upsert` devolve `{ error }`: quem não
 * confere grava nada e segue em frente.
 *
 * No Vínculo (28/10): as 3 gravações em `supervisor_flags` (índice parcial
 * `supervisor_flags_open_uq ... where status = 'open'`) falhavam assim desde
 * que a tabela nasceu. O supervisor de IA nunca gravou uma marcação: 0 linhas.
 *
 * A mesma coisa repetida é falta de rede, não de atenção. Esta é a rede:
 * ela lê os índices que SOBRAM depois de todas as migrations (criados menos
 * derrubados) e cobra que a chave de cada `upsert` case com um deles.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O QUE ELA NÃO MEDE
 *
 * Tabela cujo DDL de unicidade este contrato não encontrou fica de fora, em vez
 * de acusar: a verdade está no banco, e o arquivo de migration é a melhor cópia
 * offline — não a única forma de declarar unicidade. Acusar por não ter achado
 * produziria falha por defasagem do parser, e contrato que acusa inocente acaba
 * desligado. O que ele garante é mais estreito e mais útil: **quando o índice é
 * conhecido e é parcial ou de expressão, isso é defeito.**
 *
 * Roda sem rede e sem banco.
 * ═════════════════════════════════════════════════════════════════════════════
 */

const RAIZ = join(process.cwd(), "src");
const MIGRACOES = join(process.cwd(), "supabase", "migrations");

interface IndiceUnico {
  nome: string;
  tabela: string;
  colunas: string[];
  /** `where ...`: o Postgres não o infere sem o predicado na instrução. */
  parcial: boolean;
  /** `coalesce(x,'')`, `lower(x)`: nunca inferido por lista de colunas. */
  expressao: boolean;
}

/** Lê uma lista entre parênteses respeitando parênteses aninhados. */
function listaBalanceada(texto: string, aberturaEm: number): { itens: string[]; fim: number } {
  let nivel = 0;
  let inicio = aberturaEm + 1;
  const itens: string[] = [];
  for (let i = aberturaEm; i < texto.length; i++) {
    const c = texto[i];
    if (c === "(") nivel++;
    else if (c === ")") {
      nivel--;
      if (nivel === 0) {
        itens.push(texto.slice(inicio, i));
        return { itens: itens.map((t) => t.trim()).filter(Boolean), fim: i };
      }
    } else if (c === "," && nivel === 1) {
      itens.push(texto.slice(inicio, i));
      inicio = i + 1;
    }
  }
  return { itens: [], fim: texto.length };
}

/** O SQL sem comentário: a prosa das migrations cita o defeito que a regra proíbe. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Os índices únicos que sobram depois de todas as migrations.
 *
 * **Na ordem TEXTUAL de cada arquivo, e não "primeiro os creates, depois os
 * drops".** `20260816240000` derruba `uq_vendas_origem_external` e recria no
 * mesmo arquivo, logo abaixo; processar por tipo apagaria a recriação e o
 * contrato concluiria que `vendas` não tem índice nenhum — justamente a tabela
 * onde o defeito foi corrigido primeiro.
 */
function indicesUnicos(): Map<string, IndiceUnico[]> {
  const vivos = new Map<string, IndiceUnico>();

  for (const arquivo of readdirSync(MIGRACOES)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = semComentarios(readFileSync(join(MIGRACOES, arquivo), "utf8"));
    const eventos: { pos: number; aplicar: () => void }[] = [];

    // `create unique index [if not exists] nome on [public.]tabela (cols) [where ...]`
    const re =
      /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?:public\.)?(\w+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const { itens, fim } = listaBalanceada(sql, re.lastIndex - 1);
      const resto = sql.slice(fim, sql.indexOf(";", fim) + 1);
      const i: IndiceUnico = {
        nome: m[1]!,
        tabela: m[2]!.toLowerCase(),
        colunas: itens,
        parcial: /\bwhere\b/i.test(resto),
        expressao: itens.some((c) => c.includes("(")),
      };
      eventos.push({ pos: m.index, aplicar: () => vivos.set(i.nome.toLowerCase(), i) });
    }

    // `alter table t add constraint c unique (cols)` / `primary key (cols)`
    const reC =
      /alter\s+table\s+(?:only\s+)?(?:public\.)?(\w+)[\s\S]{0,200}?add\s+constraint\s+(\w+)\s+(?:unique|primary\s+key)\s*\(/gi;
    while ((m = reC.exec(sql)) !== null) {
      const { itens } = listaBalanceada(sql, reC.lastIndex - 1);
      const i: IndiceUnico = {
        nome: m[2]!,
        tabela: m[1]!.toLowerCase(),
        colunas: itens,
        parcial: false,
        expressao: false,
      };
      eventos.push({ pos: m.index, aplicar: () => vivos.set(i.nome.toLowerCase(), i) });
    }

    // Unicidade declarada DENTRO do create table.
    const reT = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi;
    while ((m = reT.exec(sql)) !== null) {
      const tabela = m[1]!.toLowerCase();
      const { itens: corpo } = listaBalanceada(sql, reT.lastIndex - 1);
      const pos = m.index;
      for (const linha of corpo) {
        const d = /^(?:constraint\s+(\w+)\s+)?(?:unique|primary\s+key)\s*\(/i.exec(linha);
        if (!d) continue;
        const { itens } = listaBalanceada(linha, linha.indexOf("("));
        const nome = (d[1] ?? `${tabela}_${itens.join("_")}_inline`).toLowerCase();
        const i: IndiceUnico = { nome, tabela, colunas: itens, parcial: false, expressao: false };
        eventos.push({ pos, aplicar: () => vivos.set(nome, i) });
      }
    }

    for (const d of sql.matchAll(
      /drop\s+index\s+(?:if\s+exists\s+)?(?:public\.)?([\w,\s.]+?);/gi,
    )) {
      // `drop index a, b;` derruba os dois.
      const nomes = d[1]!.split(",").map((n) =>
        n
          .trim()
          .replace(/^public\./, "")
          .toLowerCase(),
      );
      eventos.push({ pos: d.index, aplicar: () => nomes.forEach((n) => vivos.delete(n)) });
    }
    for (const d of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?(?:public\.)?\w+\s+drop\s+constraint\s+(?:if\s+exists\s+)?(\w+)/gi,
    )) {
      const nome = d[1]!.toLowerCase();
      eventos.push({ pos: d.index, aplicar: () => vivos.delete(nome) });
    }

    for (const e of eventos.sort((a, b) => a.pos - b.pos)) e.aplicar();
  }

  const porTabela = new Map<string, IndiceUnico[]>();
  for (const i of vivos.values()) {
    porTabela.set(i.tabela, [...(porTabela.get(i.tabela) ?? []), i]);
  }
  return porTabela;
}

interface Chamada {
  arquivo: string;
  tabela: string;
  colunas: string[];
}

/** Todo `.from("t")…upsert(…, { onConflict: "a,b" })` do código de produção. */
function upserts(): Chamada[] {
  const arquivos: string[] = [];
  const varrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (statSync(caminho).isDirectory()) varrer(caminho);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) arquivos.push(caminho);
    }
  };
  varrer(RAIZ);

  const saida: Chamada[] = [];
  for (const arquivo of arquivos) {
    const fonte = readFileSync(arquivo, "utf8");
    /*
      `.from("x")` … `onConflict:` — com o vão sem outro `.from(`, senão a
      expressão atravessa a fronteira entre duas consultas de um mesmo
      `Promise.all` e atribui a chave de uma à tabela da outra. É o mesmo
      cuidado que o contrato `colunaExiste` precisou ter.
    */
    const re =
      /\.from\(\s*["'](\w+)["']\s*\)((?:(?!\.from\()[\s\S]){0,2500}?)onConflict:\s*(?:["'`]([^"'`]+)["'`]|(\w+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      // Chave numa constante: resolve o literal no mesmo arquivo.
      const literal =
        m[3] ??
        (m[4] ? (new RegExp(`${m[4]}\\s*=\\s*["']([^"']+)["']`).exec(fonte)?.[1] ?? null) : null);
      if (!literal) continue;
      saida.push({
        arquivo: arquivo.replace(RAIZ, "src"),
        tabela: m[1]!.toLowerCase(),
        colunas: literal.split(",").map((c) => c.trim()),
      });
    }
  }
  return saida;
}

// O remix do Lovable não copia supabase/migrations (o banco nasce do esquema do original):
// sem a pasta não há o que medir, e o contrato roda no repositório original.
describe.skipIf(!existsSync(MIGRACOES))(
  "contrato: a chave de todo upsert casa com um índice inferível",
  () => {
    const porTabela = existsSync(MIGRACOES) ? indicesUnicos() : new Map<string, IndiceUnico[]>();
    const chamadas = upserts();

    test("o parser achou índices e upserts para medir", () => {
      // Se a extração quebrar, o teste passaria vazio e daria falsa sensação de
      // rede. Melhor falhar aqui.
      expect(porTabela.size, "nenhum índice único lido das migrations").toBeGreaterThan(10);
      expect(chamadas.length, "nenhum upsert com onConflict encontrado").toBeGreaterThan(5);
      // Âncora conhecida, para o parser não passar a devolver lixo.
      expect(
        porTabela
          .get("supervisor_flags")
          ?.some((i) => i.nome === "supervisor_flags_open_uq" && i.parcial),
      ).toBe(true);
    });

    test("nenhum upsert aponta para índice parcial ou de expressão", () => {
      const mesmoConjunto = (a: string[], b: string[]) =>
        a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

      /*
      A coluna por trás de uma expressão.

      `coalesce(entidade_id, '')` é um índice SOBRE `entidade_id`, e é
      justamente a forma que escapava: comparando ao pé da letra, o alvo
      `brand_id,tipo,entidade_id` não casava com
      `brand_id,tipo,coalesce(entidade_id,'')`, o contrato concluía "não achei
      índice com essas colunas" e deixava passar o defeito de `alertas` —
      medido: o upsert de lá respondia 42P10 e derrubava a detecção inteira.
    */
      const semExpressao = (c: string): string => {
        if (!c.includes("(")) return c;
        const dentro = /\(([^,)]*)/.exec(c)?.[1]?.trim() ?? c;
        return dentro.replace(/^["']|["']$/g, "");
      };

      const erros: string[] = [];
      for (const c of chamadas) {
        const daTabela = porTabela.get(c.tabela);
        // Tabela sem DDL de unicidade conhecido: não é o que este contrato mede.
        if (!daTabela || daTabela.length === 0) continue;

        const inferivel = daTabela.some(
          (i) => !i.parcial && !i.expressao && mesmoConjunto(i.colunas, c.colunas),
        );
        if (inferivel) continue;

        const parecido = daTabela.find(
          (i) =>
            mesmoConjunto(i.colunas, c.colunas) ||
            mesmoConjunto(i.colunas.map(semExpressao), c.colunas),
        );
        // Nenhum índice com essas colunas: pode ser unicidade declarada de um
        // jeito que o parser não lê. Só acusa quando ACHOU e ele não serve.
        if (!parecido) continue;

        erros.push(
          `${c.arquivo}: upsert em ${c.tabela} (${c.colunas.join(", ")}) aponta para ` +
            `${parecido.nome}, que é ${parecido.parcial ? "PARCIAL" : "de EXPRESSÃO"}`,
        );
      }

      expect(
        erros,
        "O Postgres não infere índice parcial sem o predicado na instrução, nem índice de " +
          "expressão por lista de colunas. O PostgREST manda só as colunas: estes upserts " +
          "respondem 42P10 e não gravam nada.\n  " +
          erros.join("\n  "),
      ).toEqual([]);
    });
  },
);
