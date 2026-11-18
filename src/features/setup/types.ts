import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface StepStatus {
  done: boolean;
  /** Uma frase curta do estado atual ("WhatsApp conectado: (11) 9…", "Falta a chave"). */
  summary: string;
  loading: boolean;
}

export interface StepProps {
  accountId: string;
  /** Avança para o próximo passo pendente. */
  onDone: () => void;
}

export interface SetupStepDef {
  id: string;
  title: string;
  /** Por que este passo importa, em uma linha, para quem nunca configurou nada. */
  why: string;
  icon: LucideIcon;
  /** Opcional: o cliente pode pular sem que a central fique "incompleta". */
  optional?: boolean;
  /** Minutos estimados, mostrado ao lado do título. */
  minutes: number;
  useStatus: (accountId: string) => StepStatus;
  Component: ComponentType<StepProps>;
}

export interface SetupSettings {
  segment?: string;
  skipped?: string[];
  dismissed?: boolean;
  ai_mode?: "included" | "openai" | "anthropic";
  team_solo?: boolean;
}
