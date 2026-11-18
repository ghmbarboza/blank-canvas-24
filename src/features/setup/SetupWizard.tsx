// Onboarding ÚNICO (regra de 28/10): a configuração é a conversa com a Nexa, e o roteiro dela
// é a única fonte do que falta. O assistente em passos foi aposentado. Este provider só:
// - abre a Nexa sozinha a cada acesso (uma vez por aba) enquanto faltar obrigatório;
// - expõe openNexa para o indicador do layout, o cartão do Painel e a rota /configurar.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

import { NexaModal } from "@/features/nexa/NexaModal";
import { refreshAfterTurn } from "@/features/setup-chat/api";
import { useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";

import { roteiroKey, useRoteiro } from "./progress";
import { useSetupSettings } from "./state";

interface SetupCtx {
  /** abre a Nexa (configuração por conversa e, depois, a central de conversa do agente) */
  openNexa: () => void;
  /** "Refazer configuração inicial": a Nexa recomeça do primeiro passo, sem apagar nada */
  restartNexa: () => Promise<void>;
}
const Ctx = createContext<SetupCtx | null>(null);

export function useSetup(): SetupCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSetup fora do SetupProvider");
  return c;
}

const AUTO_FLAG = "nexus:nexa-auto-opened";
// telas onde a Nexa não abre por cima (quem chega por convite ainda nem entrou na central)
const NO_AUTO = /^\/(convite|entrar|bem-vindo)/;

export function SetupProvider({ children }: { children: ReactNode }) {
  const { current, isAdmin } = useAccount();
  const accountId = current?.accountId ?? null;
  const setup = useSetupSettings();
  const roteiro = useRoteiro(accountId, isAdmin);
  const [open, setOpen] = useState(false);
  const pending = roteiro.data?.requiredPending ?? 0;

  // primeira coisa depois de criar a conta, e de novo a cada acesso enquanto faltar o mínimo
  useEffect(() => {
    if (!accountId || !isAdmin || !roteiro.data || pending === 0) return;
    if (NO_AUTO.test(window.location.pathname)) return;
    try {
      if (sessionStorage.getItem(AUTO_FLAG) === accountId) return;
      sessionStorage.setItem(AUTO_FLAG, accountId);
    } catch {
      /* sem sessionStorage: abre assim mesmo */
    }
    setOpen(true);
  }, [accountId, isAdmin, roteiro.data, pending]);

  const qc = useQueryClient();
  // a conversa da Nexa congela o histórico ao montar: depois de recomeçar, monta de novo
  const [round, setRound] = useState(0);
  const openNexa = useCallback(() => setOpen(true), []);
  const restartNexa = useCallback(async () => {
    if (!accountId) return;
    await callApi("/api/setup-chat", { accountId, action: "restart" });
    refreshAfterTurn(qc, accountId);
    await qc.invalidateQueries({ queryKey: roteiroKey(accountId) });
    setRound((r) => r + 1);
    setOpen(true);
  }, [accountId, qc]);
  const value = useMemo(() => ({ openNexa, restartNexa }), [openNexa, restartNexa]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {accountId && isAdmin ? (
        <NexaModal
          key={round}
          accountId={accountId}
          open={open}
          onOpenChange={setOpen}
          segment={setup.segment ?? null}
        />
      ) : null}
    </Ctx.Provider>
  );
}
