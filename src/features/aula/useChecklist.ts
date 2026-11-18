import { useCallback, useEffect, useState } from "react";

/** Lê a lista guardada, descartando o que não for um id conhecido. */
export function parseStored(raw: string | null, validIds: readonly string[]): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return validIds.filter((id) => parsed.includes(id));
  } catch {
    return [];
  }
}

/** Marca ou desmarca um id, devolvendo uma lista nova. */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): a lista vale só enquanto a página está aberta.
  }
}

export interface Checklist {
  checked: readonly string[];
  isChecked: (id: string) => boolean;
  toggle: (id: string) => void;
  reset: () => void;
}

/**
 * Lista marcável guardada no navegador. Começa vazia (igual ao HTML do servidor) e carrega
 * o que estava guardado depois de montar. `validIds` deve ser uma constante de módulo.
 */
export function useChecklist(storageKey: string, validIds: readonly string[]): Checklist {
  const [state, setState] = useState<{ loaded: boolean; ids: string[] }>({
    loaded: false,
    ids: [],
  });

  useEffect(() => {
    setState({ loaded: true, ids: parseStored(readStorage(storageKey), validIds) });
  }, [storageKey, validIds]);

  useEffect(() => {
    if (state.loaded) writeStorage(storageKey, state.ids);
  }, [storageKey, state]);

  const toggle = useCallback(
    (id: string) => {
      if (!validIds.includes(id)) return;
      setState((prev) => ({ loaded: true, ids: toggleId(prev.ids, id) }));
    },
    [validIds],
  );

  const reset = useCallback(() => setState({ loaded: true, ids: [] }), []);

  const isChecked = useCallback((id: string) => state.ids.includes(id), [state.ids]);

  return { checked: state.ids, isChecked, toggle, reset };
}
