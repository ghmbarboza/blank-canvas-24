import { Globe, Mail, MessageSquareText, Phone } from "lucide-react";
import { useId } from "react";

import { cn } from "@/lib/utils";
import { BRAND_ICONS } from "./brand-icons";
import { PLATFORM_LABEL } from "./platform-label";

// Plataforma interna (channels.platform) → ícone. "facebook" na caixa de entrada é o Messenger.
const ICON_FOR_PLATFORM: Record<string, string> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  facebook: "messenger",
  messenger: "messenger",
  linkedin: "linkedin",
  tiktok: "tiktok",
  telegram: "telegram",
  x: "x",
  threads: "threads",
  bluesky: "bluesky",
  reddit: "reddit",
  youtube: "youtube",
  google_business: "google_business",
};

type Props = {
  platform: string;
  size?: number;
  // "color": glifo na cor oficial · "badge": círculo da cor da marca com glifo branco
  variant?: "color" | "badge" | "mono";
  className?: string;
  title?: string;
};

export function ChannelIcon({ platform, size = 16, variant = "color", className, title }: Props) {
  const gradientId = useId();
  const key = ICON_FOR_PLATFORM[platform];
  const icon = key ? BRAND_ICONS[key] : undefined;
  const label = title ?? PLATFORM_LABEL[platform] ?? platform;

  if (!icon) {
    const Fallback =
      platform === "webchat"
        ? Globe
        : platform === "voice"
          ? Phone
          : platform === "email"
            ? Mail
            : MessageSquareText;
    return (
      <span
        role="img"
        aria-label={label}
        className={cn(
          "inline-grid place-items-center",
          variant === "badge" && "rounded-full bg-muted-foreground text-surface",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Fallback style={{ width: size * 0.62, height: size * 0.62 }} aria-hidden />
      </span>
    );
  }

  // Marcas pretas (TikTok, X, Threads) ficam legíveis no escuro usando a cor do texto.
  const isBlack = icon.hex === "#000000";
  const isInstagram = key === "instagram";
  const glyphFill =
    variant === "badge"
      ? "#fff"
      : variant === "mono" || isBlack
        ? "currentColor"
        : isInstagram
          ? `url(#${gradientId})`
          : icon.hex;

  const svg = (
    <svg
      viewBox="0 0 24 24"
      width={variant === "badge" ? size * 0.58 : size}
      height={variant === "badge" ? size * 0.58 : size}
      aria-hidden
    >
      {isInstagram && variant === "color" && (
        <defs>
          <radialGradient id={gradientId} cx="30%" cy="107%" r="150%">
            <stop offset="0%" stopColor="#FDF497" />
            <stop offset="5%" stopColor="#FDF497" />
            <stop offset="45%" stopColor="#FD5949" />
            <stop offset="60%" stopColor="#D6249F" />
            <stop offset="90%" stopColor="#285AEB" />
          </radialGradient>
        </defs>
      )}
      <path d={icon.path} fill={glyphFill} />
    </svg>
  );

  if (variant !== "badge") {
    return (
      <span
        role="img"
        aria-label={label}
        className={cn("inline-flex shrink-0", isBlack && "text-foreground", className)}
      >
        {svg}
      </span>
    );
  }

  const background = isInstagram
    ? "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)"
    : isBlack
      ? "#111"
      : icon.hex;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background }}
    >
      {svg}
    </span>
  );
}
