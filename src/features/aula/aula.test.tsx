import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { BRAND } from "@/lib/brand";

import { AulaPage } from "./AulaPage";
import { splitEmphasis } from "./rich";
import { AFTER_CLASS, CAUTIONS, PREP_ITEMS, STEP_IDS, STEPS, TAKEAWAYS } from "./steps";
import { parseStored, toggleId, useChecklist } from "./useChecklist";

const IDS = ["a", "b", "c"] as const;
const KEY = "aula:teste";

// O jsdom deste projeto não traz localStorage: um armazenamento em memória por teste.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: memoryStorage(),
  });
});

describe("conteúdo da aula", () => {
  test("são sete passos com ids únicos", () => {
    expect(STEPS).toHaveLength(7);
    expect(new Set(STEP_IDS).size).toBe(7);
  });

  test("todo passo diz o que fazer, o que conferir e o que fazer se travou", () => {
    for (const step of STEPS) {
      expect(step.actions.length).toBeGreaterThanOrEqual(2);
      expect(step.check.length).toBeGreaterThan(10);
      expect(step.stuck.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("o primeiro passo leva para a cópia do projeto", () => {
    expect(STEPS[0]?.cta?.href).toBe(BRAND.remixUrl);
  });

  test("o passo das regras lista as sete regras de pós-venda", () => {
    expect(STEPS.find((s) => s.id === "regras")?.extras).toHaveLength(7);
  });

  test("nenhum texto usa travessão e todo destaque fecha", () => {
    const texts = [
      ...STEPS.flatMap((s) => [s.title, s.why, s.check, ...s.actions, ...s.stuck]),
      ...STEPS.flatMap((s) => s.extras?.flatMap((e) => [e.name, e.what]) ?? []),
      ...[...PREP_ITEMS, ...CAUTIONS, ...AFTER_CLASS, ...TAKEAWAYS].flatMap((i) => [
        i.title,
        i.detail,
      ]),
    ];
    for (const text of texts) {
      expect(text).not.toContain("—");
      expect(splitEmphasis(text).length % 2).toBe(1);
    }
  });
});

describe("parseStored e toggleId", () => {
  test("ignora lixo e ids desconhecidos", () => {
    expect(parseStored(null, IDS)).toEqual([]);
    expect(parseStored("{nao e json", IDS)).toEqual([]);
    expect(parseStored('{"a":1}', IDS)).toEqual([]);
    expect(parseStored('["c","x","a"]', IDS)).toEqual(["a", "c"]);
  });

  test("marca e desmarca sem alterar a lista original", () => {
    const original = ["a"];
    expect(toggleId(original, "b")).toEqual(["a", "b"]);
    expect(toggleId(original, "a")).toEqual([]);
    expect(original).toEqual(["a"]);
  });
});

describe("useChecklist", () => {
  test("marca, guarda no navegador e recupera ao reabrir", () => {
    const first = renderHook(() => useChecklist(KEY, IDS));
    act(() => first.result.current.toggle("b"));
    expect(first.result.current.isChecked("b")).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('["b"]');
    first.unmount();

    const second = renderHook(() => useChecklist(KEY, IDS));
    expect(second.result.current.checked).toEqual(["b"]);
  });

  test("ignora id desconhecido e limpa com reset", () => {
    const { result } = renderHook(() => useChecklist(KEY, IDS));
    act(() => result.current.toggle("zzz"));
    expect(result.current.checked).toEqual([]);
    act(() => result.current.toggle("a"));
    act(() => result.current.reset());
    expect(result.current.checked).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBe("[]");
  });

  test("funciona quando o navegador bloqueia o armazenamento", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("bloqueado");
      },
    });
    const { result } = renderHook(() => useChecklist(KEY, IDS));
    act(() => result.current.toggle("a"));
    expect(result.current.checked).toEqual(["a"]);
  });
});

describe("AulaPage", () => {
  test("mostra o botão de cópia, os sete passos e avança o passo atual", () => {
    render(<AulaPage />);

    const copy = screen.getByRole("link", { name: /Fazer a minha cópia no Lovable/ });
    expect(copy).toHaveAttribute("href", BRAND.remixUrl);
    expect(copy).toHaveAttribute("target", "_blank");

    expect(screen.getAllByRole("button", { name: /Marcar o passo \d como feito/ })).toHaveLength(7);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    act(() => screen.getByRole("button", { name: "Marcar o passo 1 como feito" }).click());

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("button", { name: "Passo 1 feito" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("navigation", { name: "Andamento da aula" })).toHaveTextContent(
      "Passo 2 de 7",
    );
  });
});
