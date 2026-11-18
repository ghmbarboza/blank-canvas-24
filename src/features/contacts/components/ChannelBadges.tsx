import { Mail, Phone } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { cn } from "@/lib/utils";

import { isPlatformSource, type ContactRow } from "../types";

const BADGE =
  "grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted-foreground";

type Props = {
  contact: Pick<ContactRow, "email" | "phone" | "source">;
  platforms: string[] | undefined;
  className?: string;
};

// Selos dos canais por onde dá para falar com a pessoa: redes vinculadas, e-mail e telefone.
export function ChannelBadges({ contact, platforms, className }: Props) {
  const list =
    platforms && platforms.length > 0
      ? platforms
      : isPlatformSource(contact.source)
        ? [contact.source]
        : [];
  const hasPhoneChannel = list.some((p) => p === "whatsapp" || p === "sms");
  const items = [
    ...list.slice(0, 3).map((p) => (
      <span key={p} className={BADGE} title={PLATFORM_LABEL[p] ?? p}>
        <ChannelIcon platform={p} size={13} variant="mono" />
      </span>
    )),
    contact.email ? (
      <span key="email" className={BADGE} title={`E-mail: ${contact.email}`}>
        <Mail className="size-3.5" aria-label="E-mail" />
      </span>
    ) : null,
    contact.phone && !hasPhoneChannel ? (
      <span key="phone" className={BADGE} title={`Telefone: ${contact.phone}`}>
        <Phone className="size-3.5" aria-label="Telefone" />
      </span>
    ) : null,
  ].filter(Boolean);

  if (items.length === 0) return <span className="text-[12px] text-subtle">—</span>;
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {items}
      {list.length > 3 && (
        <span className="text-[11px] text-subtle tabular-nums">+{list.length - 3}</span>
      )}
    </span>
  );
}

// Nota da IA (0–100) em número; frio fica apagado para a lista se ler pela intensidade.
export function AiScore({
  score,
  temperature,
}: {
  score: number | null;
  temperature: string | null;
}) {
  if (typeof score !== "number") return <span className="text-[12px] text-subtle">—</span>;
  return (
    <span
      className={cn(
        "font-display text-[15px] font-semibold tabular-nums",
        temperature === "cold" ? "text-subtle" : "text-foreground",
      )}
      title="Nota da IA, de 0 a 100"
    >
      {score}
    </span>
  );
}
