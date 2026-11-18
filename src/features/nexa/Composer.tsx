// Caixa de texto da Nexa, no jeito do ChatGPT: escreve, fala pelo microfone, anexa documento
// para a biblioteca e envia. Enter envia, Shift+Enter quebra linha.
import { ArrowUp, Loader2, Mic, Paperclip, Square } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

import { ACCEPT } from "@/features/setup-chat/SidePanel";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onFiles: (files: FileList | null) => void;
  isStreaming: boolean;
  isUploading: boolean;
  canListen: boolean;
  isListening: boolean;
  onListen: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
};

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onFiles,
  isStreaming,
  isUploading,
  canListen,
  isListening,
  onListen,
  inputRef,
}: Props) {
  const file = useRef<HTMLInputElement>(null);
  const busy = isStreaming || isUploading;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, inputRef]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-[26px] border border-border bg-surface p-2 shadow-[0_8px_30px_-12px_rgb(10_31_59/0.18)] focus-within:border-foreground/25"
    >
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={isListening ? "Estou ouvindo…" : "Converse com a Nexa…"}
        aria-label="Mensagem para a Nexa"
        className="block max-h-[200px] min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={busy}
          aria-label="Enviar documento para a biblioteca"
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
        </button>
        <input
          ref={file}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex items-center gap-1.5">
          {canListen ? (
            <button
              type="button"
              onClick={onListen}
              disabled={busy}
              aria-label={isListening ? "Parar de ouvir" : "Falar com a Nexa"}
              aria-pressed={isListening}
              className={cn(
                "grid size-9 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                isListening
                  ? "bg-[hsl(var(--nexa-accent))] text-white"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {isListening ? (
                <span aria-hidden className="flex h-3.5 items-center gap-[3px]">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-full w-[3px] rounded-full bg-current animate-[nexa-wave_0.9s_ease-in-out_infinite]"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </span>
              ) : (
                <Mic className="size-[18px]" />
              )}
            </button>
          ) : null}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Parar"
              className="grid size-9 place-items-center rounded-full bg-foreground text-background"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!value.trim() || busy}
              aria-label="Enviar"
              className="grid size-9 place-items-center rounded-full bg-foreground text-background transition disabled:opacity-30"
            >
              <ArrowUp className="size-[18px]" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
