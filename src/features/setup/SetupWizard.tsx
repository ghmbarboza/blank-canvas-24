// Onboarding ÚNICO: o roteiro do servidor é a única fonte do que falta. Este provider mostra o
// passo a passo (Primeiros passos, com formulário e botão em cada passo) e a conversa com a Cris,
// que fica como ajuda ao lado. Ele:
// - abre o passo a passo sozinho a cada acesso (uma vez por aba) enquanto faltar obrigatório;
// - expõe openNexa para o indicador do layout, o cartão do Painel e a rota /configurar: enquanto
//   houver passo pendente ela abre o passo a passo; depois, a conversa com a Cris.
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
import { SetupGuide } from "./SetupGuide";
import { useSetupSettings } from "./state";

interface SetupCtx {
  /** abre a configuração: o passo a passo enquanto faltar passo; depois, a conversa com a Cris */
  openNexa: () => void;
  /** abre o passo a passo, direto num passo se for o caso */
  openGuide: (step?: string) => void;
  /** abre a conversa com a Cris */
  openVi: () => void;
  /** "Refazer configuração inicial": a Cris recomeça do primeiro passo, sem apagar nada */
  restartNexa: () => Promise<void>;
}
const Ctx = createContext<SetupCtx | null>(null);

export function useSetup(): SetupCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSetup fora do SetupProvider");
  return c;
}

const AUTO_FLAG = "nexus:nexa-auto-opened";
// telas onde nada abre por cima (quem chega por convite ainda nem entrou na central)
const NO_AUTO = /^\/(convite|entrar|bem-vindo|aula)/;

export function SetupProvider({ children }: { children: ReactNode }) {
  const { current, isAdmin } = useAccount();
  const accountId = current?.accountId ?? null;
  const setup = useSetupSettings();
  const roteiro = useRoteiro(accountId, isAdmin);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState<string | null>(null);
  const [viOpen, setViOpen] = useState(false);
  const pending = roteiro.data?.requiredPending ?? 0;
  const remaining = roteiro.data?.remaining ?? 0;

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
    setGuideOpen(true);
  }, [accountId, isAdmin, roteiro.data, pending]);

  const qc = useQueryClient();
  // a conversa da Cris congela o histórico ao montar: depois de recomeçar, monta de novo
  const [round, setRound] = useState(0);

  const openGuide = useCallback((step?: string) => {
    setViOpen(false);
    setGuideStep(step ?? null);
    setGuideOpen(true);
  }, []);
  const openVi = useCallback(() => {
    setGuideOpen(false);
    setViOpen(true);
  }, []);
  const openNexa = useCallback(() => {
    if (remaining > 0) openGuide();
    else openVi();
  }, [remaining, openGuide, openVi]);
  const restartNexa = useCallback(async () => {
    if (!accountId) return;
    await callApi("/api/setup-chat", { accountId, action: "restart" });
    refreshAfterTurn(qc, accountId);
    await qc.invalidateQueries({ queryKey: roteiroKey(accountId) });
    setRound((r) => r + 1);
    setGuideOpen(false);
    setViOpen(true);
  }, [accountId, qc]);
  const value = useMemo(
    () => ({ openNexa, openGuide, openVi, restartNexa }),
    [openNexa, openGuide, openVi, restartNexa],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {accountId && isAdmin ? (
        <>
          <SetupGuide
            accountId={accountId}
            open={guideOpen}
            onOpenChange={setGuideOpen}
            step={guideStep}
            onStep={setGuideStep}
            onAskVi={openVi}
          />
          <NexaModal
            key={round}
            accountId={accountId}
            open={viOpen}
            onOpenChange={setViOpen}
            segment={setup.segment ?? null}
            onOpenStep={openGuide}
          />
        </>
      ) : null}
    </Ctx.Provider>
  );
}
