import { Download, FileText, Loader2, Bot } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useSignedMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { ThreadMessage } from "../types";

interface Props {
  message: ThreadMessage;
  outgoing: boolean;
}

export function MessageMedia({ message, outgoing }: Props) {
  const url = useSignedMediaUrl(message.media_url);
  const name = message.media_name ?? "Arquivo";

  if (!message.media_url) {
    if (!message.optimistic) return null;
    return (
      <div className="flex items-center gap-2 text-[13px] opacity-90">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Enviando {name}…
      </div>
    );
  }
  if (url.isLoading) return <Skeleton className="h-40 w-56 rounded-xl" />;
  if (url.isError || !url.data) {
    return <p className="text-[13px] italic opacity-80">Não deu para abrir o arquivo.</p>;
  }

  switch (message.type) {
    case "image":
    case "sticker":
      return (
        <a
          href={url.data}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={url.data}
            alt={message.body || name || "Imagem"}
            loading="lazy"
            className="max-h-72 max-w-full rounded-xl object-cover"
          />
        </a>
      );
    case "audio":
      return (
        <div className="space-y-2">
          <audio
            controls
            preload="metadata"
            src={url.data}
            className="h-10 w-64 max-w-full rounded-full"
          >
            <track kind="captions" />
          </audio>
          {message.transcript && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2 text-[13px] leading-relaxed",
                outgoing
                  ? "border-primary-foreground/20 bg-primary-foreground/10"
                  : "border-primary-line bg-primary-soft text-foreground",
              )}
            >
              <Bot
                className={cn("mt-0.5 size-3.5 shrink-0", !outgoing && "text-primary")}
                aria-hidden
              />
              <p>
                <span className="font-semibold">Transcrição: </span>
                {message.transcript}
              </p>
            </div>
          )}
        </div>
      );
    case "video":
      return (
        <video
          controls
          preload="metadata"
          src={url.data}
          className="max-h-72 max-w-full rounded-xl"
        >
          <track kind="captions" />
        </video>
      );
    default:
      return (
        <a
          href={url.data}
          target="_blank"
          rel="noopener noreferrer"
          download={name}
          className={cn(
            "flex min-w-52 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            outgoing
              ? "bg-primary-foreground/10 hover:bg-primary-foreground/15"
              : "bg-surface hover:bg-surface-3",
          )}
        >
          <FileText className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
          <Download className="size-4 shrink-0 opacity-70" aria-label="Baixar" />
        </a>
      );
  }
}
