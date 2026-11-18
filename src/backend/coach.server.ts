// Camada 2 do livecoach no servidor: o worker manda o trecho recente e o que já foi coberto,
// e o prompt sai do mesmo motor testado no vitest (src/features/coach/engine.ts).
import { callJson } from "@/backend/llm.server";
import { loadPlaybook } from "@/backend/meetings.server";
import {
  COACH_TIPS_SCHEMA,
  INITIAL_STATE,
  buildCoachPrompt,
  type TipKind,
} from "@/features/coach/engine";

export interface ServerTip {
  kind: TipKind;
  title: string;
  body: string;
}

export async function tips(
  meeting: { id: string; account_id: string; playbook_id: string | null },
  recent: { speaker: "vendedor" | "cliente"; text: string }[],
  covered: string[],
): Promise<ServerTip[]> {
  const playbook = await loadPlaybook(meeting.playbook_id);
  const state = {
    ...INITIAL_STATE,
    covered: covered.filter((c) => typeof c === "string").slice(0, 80),
  };
  const { system, user } = buildCoachPrompt(playbook, recent, state);
  const { data } = await callJson<{ tips?: ServerTip[] }>(meeting.account_id, "meeting_coach", {
    system,
    messages: [{ role: "user", content: user }],
    schemaName: "dicas",
    schema: COACH_TIPS_SCHEMA as unknown as Record<string, unknown>,
    // o Gemini do gateway gasta tokens pensando; abaixo disso a resposta volta vazia
    maxTokens: 1500,
  });
  return (data.tips ?? []).slice(0, 2);
}
