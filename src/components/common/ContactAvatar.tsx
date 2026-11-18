import { User, Users } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  name: string | null | undefined;
  src?: string | null | undefined;
  platform?: string | null | undefined;
  isGroup?: boolean;
  size?: number;
  className?: string;
};

// Tons estáveis por nome dentro da rampa navy do DS (sem cor quente, roxo ou neon).
const TONES = [
  "bg-[#E3E8EF] text-[#001F35] dark:bg-[#26344F] dark:text-[#E0E7F1]",
  "bg-[#EEF2F7] text-[#335379] dark:bg-[#1C2840] dark:text-[#A8BAD4]",
  "bg-[#F0F2F5] text-[#344054] dark:bg-[#1B273F] dark:text-[#D0D5DD]",
  "bg-[#DDE4EE] text-[#12384f] dark:bg-[#22304A] dark:text-[#C5D1E2]",
  "bg-[#E4E7EC] text-[#475467] dark:bg-[#24324D] dark:text-[#AEB8C6]",
];

const hasLetters = (name: string | null | undefined) => /\p{L}/u.test(name ?? "");

function toneFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] ?? TONES[0]!;
}

export function ContactAvatar({
  name,
  src,
  platform,
  isGroup = false,
  size = 40,
  className,
}: Props) {
  const badge = Math.max(14, Math.round(size * 0.42));
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full rounded-full object-cover ring-1 ring-border"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className={cn(
            "grid size-full place-items-center rounded-full font-semibold ring-1 ring-border",
            isGroup ? "bg-surface-3 text-muted-foreground" : toneFor(name ?? "?"),
          )}
          style={{ fontSize: size * 0.36 }}
          aria-hidden
        >
          {isGroup ? (
            <Users style={{ width: size * 0.45, height: size * 0.45 }} />
          ) : hasLetters(name) ? (
            initials(name)
          ) : (
            // contato só com telefone: "+5" não é inicial; mostra o ícone de pessoa
            <User style={{ width: size * 0.45, height: size * 0.45 }} />
          )}
        </span>
      )}
      {platform && (
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-surface">
          <ChannelIcon platform={platform} variant="badge" size={badge} />
        </span>
      )}
    </span>
  );
}
