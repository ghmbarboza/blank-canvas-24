import { ArrowRight, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Graph, NodeType, Trigger } from "./engine";
import { NODE_ICON } from "./nodeMeta";
import { buildSentence } from "./sentence";

// Passos que falam com o contato ganham destaque: é o que o cliente final vê.
const SPEAKS: NodeType[] = ["whatsapp", "email", "sms", "voice_call", "ai_agent"];

type Props = { trigger: Trigger; graph: Graph; max?: number; muted?: boolean };

// A automação escrita como frase, montada do gatilho e dos nós reais.
export function FlowSentence({ trigger, graph, max = 4, muted = false }: Props) {
  const s = buildSentence(trigger, graph, max);
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px] leading-6 text-muted-foreground",
        muted && "opacity-60",
      )}
    >
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-0.5 font-semibold text-foreground">
        <Zap className="size-3.5 text-subtle" aria-hidden />
        {s.trigger}
      </span>
      {s.steps.length === 0 && <span className="text-subtle">ainda sem passos</span>}
      {s.steps.map((st) => {
        const Icon = NODE_ICON[st.type];
        const speaks = SPEAKS.includes(st.type);
        return (
          <span key={st.id} className="inline-flex items-center gap-1.5">
            <ArrowRight className="size-3 shrink-0 text-subtle" aria-label="depois" />
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                speaks &&
                  "rounded-lg border border-primary-line bg-primary-soft px-2 py-0.5 font-medium text-foreground",
              )}
            >
              {speaks && <Icon className="size-3.5" aria-hidden />}
              {st.text}
            </span>
          </span>
        );
      })}
      {s.more > 0 && (
        <span className="rounded-full border border-border px-2 py-[1px] text-[11px] font-medium text-subtle">
          +{s.more} {s.more === 1 ? "passo" : "passos"}
        </span>
      )}
    </p>
  );
}
