// Interface mínima do coach ao vivo, comum à ligação (Zadarma, áudio do navegador) e à
// reunião (LiveKit). A frente de reuniões traz o motor completo com playbook cadastrável;
// esta interface é o ponto de encontro.
export type Speaker = "seller" | "customer";

export interface TranscriptSegment {
  speaker: Speaker;
  text: string;
  final: boolean;
  at: number; // ms desde o início
}

export type TipKind = "objection" | "question" | "closing" | "compliance" | "info" | "pace";

export interface CoachTip {
  id: string;
  kind: TipKind;
  title: string;
  text: string;
  at: number;
  source: "rule" | "ai" | "playbook";
}

export interface CoachEngine {
  push(segment: TranscriptSegment): CoachTip[];
  tips(): CoachTip[];
  reset(): void;
}
