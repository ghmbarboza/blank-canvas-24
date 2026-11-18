import { Globe, Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { cn } from "@/lib/utils";

import type { TicketRow } from "./api";
import { SOURCE_LABEL } from "./constants";

// Origens sem rede social própria: ícone neutro do lucide.
const SOURCE_ICON: Record<string, LucideIcon> = {
  email: Mail,
  voice: Phone,
  webchat: MessageSquare,
  form: Globe,
};

/** Rótulo do canal por onde o chamado chegou (rede da conversa ou origem). */
function ticketChannelLabel(t: Pick<TicketRow, "source" | "conversation">): string | null {
  const platform = t.conversation?.channel?.platform;
  if (platform) return PLATFORM_LABEL[platform] ?? platform;
  if (t.source in SOURCE_ICON || t.source === "whatsapp") return SOURCE_LABEL[t.source] ?? null;
  return null;
}

// Ícone do canal de origem. Chamado aberto pela equipe ou pela API não mostra ícone.
export function TicketChannel({
  ticket: t,
  className,
}: {
  ticket: Pick<TicketRow, "source" | "conversation">;
  className?: string;
}) {
  const label = ticketChannelLabel(t);
  if (!label) return null;
  const platform =
    t.conversation?.channel?.platform ?? (t.source === "whatsapp" ? "whatsapp" : null);
  if (platform)
    return (
      <span className={cn("inline-flex shrink-0 text-subtle", className)} title={label}>
        <ChannelIcon platform={platform} size={14} variant="mono" title={label} />
      </span>
    );
  const Icon = SOURCE_ICON[t.source] ?? MessageSquare;
  return (
    <span className={cn("inline-flex shrink-0 text-subtle", className)} title={label}>
      <Icon className="size-3.5" role="img" aria-label={label} />
    </span>
  );
}
