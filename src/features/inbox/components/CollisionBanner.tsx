import { Users } from "lucide-react";

import { collisionText, type Viewer } from "../presence";

// Faixa discreta acima da resposta quando outra pessoa da equipe está na mesma conversa (#61).
export function CollisionBanner({ viewers }: { viewers: Viewer[] }) {
  const text = collisionText(viewers);
  if (!text) return null;
  const typing = viewers.some((v) => v.typing);
  return (
    <div
      role="status"
      aria-live="polite"
      data-typing={typing}
      className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-[var(--via-navy-06,rgba(10,31,59,0.06))] px-3.5 py-2 text-[13px] text-foreground lg:mx-8"
    >
      <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className={typing ? "font-medium" : undefined}>{text}</span>
    </div>
  );
}
