import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TeamMember } from "../types";

type Props = {
  member: TeamMember | undefined;
  size?: number;
  className?: string;
};

// Avatar do responsável (foto ou iniciais). Sem dono mostra um tracejado.
export function OwnerAvatar({ member, size = 20, className }: Props) {
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.42) };
  if (!member) {
    return (
      <span
        className={cn(
          "inline-block shrink-0 rounded-full border border-dashed border-border-strong",
          className,
        )}
        style={style}
        title="Sem responsável"
        aria-label="Sem responsável"
        role="img"
      />
    );
  }
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.name}
        title={member.name}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", className)}
        style={style}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-muted-foreground ring-1 ring-border",
        className,
      )}
      style={style}
      title={member.name}
      role="img"
      aria-label={member.name}
    >
      {initials(member.name)}
    </span>
  );
}
