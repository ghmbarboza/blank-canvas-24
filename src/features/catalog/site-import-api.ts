// Importar o catálogo a partir do site: ler (prévia) e confirmar. A mesma chamada serve à tela de
// Catálogo, ao passo "Sua empresa" e ao bloco de prévia dentro da conversa.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ConfirmResult,
  SiteCompany,
  SiteItem,
  SitePreview,
} from "@/backend/setup-agent/site-import/types";
import { setupKeys } from "@/features/setup-chat/api";
import { ACCOUNT_QUERY_KEY } from "@/lib/account";
import { callApi } from "@/lib/api";

import { catalogKeys } from "./api";

export function usePreviewSite(accountId: string) {
  return useMutation({
    mutationFn: (url: string) =>
      callApi<SitePreview>("/api/catalog-import", { accountId, action: "preview", url }),
  });
}

export interface ConfirmArgs {
  url: string;
  items: SiteItem[];
  company?: SiteCompany | undefined;
  saveKnowledge: boolean;
  fillCompany: boolean;
}

export function useConfirmSite(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmArgs) =>
      callApi<ConfirmResult>("/api/catalog-import", { accountId, action: "confirm", ...input }),
    onSuccess: () => {
      // catálogo, base de conhecimento, empresa e o passo a passo refletem na hora
      void qc.invalidateQueries({ queryKey: catalogKeys.products(accountId) });
      void qc.invalidateQueries({ queryKey: setupKeys.docs(accountId) });
      void qc.invalidateQueries({ queryKey: setupKeys.facts(accountId) });
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["setup"] });
    },
  });
}

/** Frase do resultado, para o aviso da tela e para a conversa. */
export function resultText(r: ConfirmResult): string {
  const parts = [
    r.created ? `${r.created} item(ns) novo(s) no catálogo` : "",
    r.updated ? `${r.updated} atualizado(s)` : "",
    r.knowledge ? "resumo e políticas na base de conhecimento" : "",
    r.company.length ? "dados da empresa preenchidos" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nada para gravar";
}
