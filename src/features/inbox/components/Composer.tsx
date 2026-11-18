import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Clock,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Paperclip,
  Square,
  SendHorizontal,
  Bot,
  X,
  Zap,
} from "lucide-react";

import { useVoiceRecorder } from "../useVoiceRecorder";
import { channelAcceptsAudio, formatDuration } from "../voice-format";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isOfficialWhatsApp } from "@/features/channels/zernio-rules";
import {
  MAX_UPLOAD_BYTES,
  useSendMessage,
  useSendNote,
  useSuggestReplies,
  type ReplySuggestion,
} from "../api";
import type { Channel, Conversation } from "../types";
import { ComposerSuggestions } from "./ComposerSuggestions";
import { useQuickReplies } from "@/features/support/api";
import { renderMacro } from "@/features/support/macros";
import { MacroSuggest } from "@/features/support/MacroSuggest";
import { fillReply, filterReplies, slashQuery } from "./quickReplies";
import { TemplatePicker } from "./TemplatePicker";

const WINDOW_MS = 24 * 60 * 60 * 1000;

const MAX_TEXTAREA_HEIGHT = 200;
type Mode = "reply" | "note";

interface Props {
  accountId: string;
  conversation: Conversation;
  channel: Channel | undefined;
  contactName?: string | null;
  /** avisa os colegas na conversa que esta pessoa está digitando (#61) */
  onTyping?: () => void;
}

export function Composer({
  accountId,
  conversation,
  channel,
  contactName = null,
  onTyping,
}: Props) {
  const [mode, setMode] = useState<Mode>("reply");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = useSendMessage(accountId, conversation.id);
  const note = useSendNote(accountId, conversation.id);
  const suggest = useSuggestReplies(accountId, conversation.id);
  const isNote = mode === "note";
  const replies = useQuickReplies(accountId);
  const [replyIndex, setReplyIndex] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);
  const slash = isNote ? null : slashQuery(text);
  const replyMatches = slash === null ? [] : filterReplies(replies.data ?? [], slash);
  const windowClosed =
    isOfficialWhatsApp(channel) &&
    (!conversation.last_inbound_at ||
      Date.now() - new Date(conversation.last_inbound_at).getTime() > WINDOW_MS);

  const applyReply = (body: string) => {
    setText(renderMacro(fillReply(body, contactName), { contactName }).text);
    setReplyIndex(0);
    textareaRef.current?.focus();
  };

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  const canSend = isNote
    ? text.trim().length > 0 && !note.isPending
    : text.trim().length > 0 || !!file;

  const submit = () => {
    const body = text.trim();
    if (!canSend) return;
    if (
      file &&
      file.type.startsWith("audio/") &&
      !channelAcceptsAudio(channel?.provider, file.type)
    ) {
      toast.error(
        "A API direta da Meta não aceita o áudio gravado neste navegador (WebM). Grave pelo Firefox ou Safari, ou anexe um arquivo .ogg ou .mp3.",
      );
      return;
    }
    if (isNote) {
      note.mutate(body, { onSuccess: () => setText("") });
      return;
    }
    send.mutate({ text: body, file, tempId: `temp-${crypto.randomUUID()}` });
    setText("");
    setFile(null);
    setSuggestions([]);
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (replyMatches.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setReplyIndex((i) => (i + step + replyMatches.length) % replyMatches.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
        e.preventDefault();
        applyReply(replyMatches[Math.min(replyIndex, replyMatches.length - 1)]!.body);
        return;
      }
      if (e.key === "Escape") {
        setText("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > MAX_UPLOAD_BYTES) {
      toast.error("Arquivo maior que 25 MB. Envie um arquivo menor.");
      return;
    }
    setFile(picked);
    setMode("reply");
  };

  const voice = useVoiceRecorder(
    (recorded) => pickFile(recorded),
    (msg) => toast.error(msg),
  );

  const askSuggestions = () => {
    setSuggestions([]);
    suggest.mutate(undefined, { onSuccess: (list) => setSuggestions(list) });
  };

  return (
    <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-4">
      <div
        className={cn(
          "mx-auto max-w-3xl overflow-hidden rounded-2xl border transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring",
          isNote ? "border-note-line bg-note" : "border-border bg-surface",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
          <div
            role="radiogroup"
            aria-label="Tipo de mensagem"
            className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5"
          >
            <ModeButton
              active={!isNote}
              onClick={() => setMode("reply")}
              icon={MessageSquare}
              label="Resposta"
            />
            <ModeButton
              active={isNote}
              onClick={() => setMode("note")}
              icon={Lock}
              label="Nota interna"
            />
          </div>
          <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-[12px] text-muted-foreground">
            {isNote ? (
              "Só a equipe vê"
            ) : channel ? (
              <>
                <span className="hidden sm:inline">Responder via</span>
                <ChannelIcon platform={channel.platform} size={14} />
                <span className="truncate font-medium text-foreground">{channel.name}</span>
              </>
            ) : (
              "Canal indisponível"
            )}
          </span>
        </div>

        {!isNote && (
          <ComposerSuggestions
            loading={suggest.isPending}
            suggestions={suggestions}
            onPick={(t) => {
              setText(t);
              textareaRef.current?.focus();
            }}
            onClose={() => setSuggestions([])}
          />
        )}

        {windowClosed && !isNote && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-surface-2/60 px-3 py-2 text-[12px] text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              Janela de 24 h fechada: só template aprovado chega ao cliente.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setTemplateOpen(true)}
            >
              <FileText /> Escolher template
            </Button>
          </div>
        )}

        {replyMatches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Respostas rápidas"
            className="max-h-56 overflow-y-auto border-b border-border/70 py-1"
          >
            {replyMatches.map((r, i) => (
              <li key={r.shortcut} role="option" aria-selected={i === replyIndex}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyReply(r.body);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                    i === replyIndex ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <Zap className="size-3.5 shrink-0 text-subtle" aria-hidden />
                  <span className="font-mono text-subtle">/{r.shortcut}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {file && !isNote && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-[12px]">
              <Paperclip className="size-3.5 text-subtle" aria-hidden />
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="Remover anexo"
                className="rounded text-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" />
              </button>
            </span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (mode === "reply") onTyping?.();
          }}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            isNote
              ? "Escreva uma nota para a equipe…"
              : "Escreva sua resposta… (/ para respostas rápidas)"
          }
          aria-label={isNote ? "Nota interna" : "Resposta"}
          className={cn(
            "block w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed outline-none",
            isNote ? "text-note-fg placeholder:text-note-fg/60" : "placeholder:text-subtle",
          )}
        />

        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Anexar arquivo (até 25 MB)"
            title="Anexar arquivo (até 25 MB)"
            disabled={isNote}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip />
          </Button>
          {!isNote &&
            (voice.recording ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1.5 text-[13px] text-foreground tabular-nums"
                  role="status"
                >
                  <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />
                  Gravando {formatDuration(voice.seconds)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Parar e anexar o áudio"
                  title="Parar e anexar o áudio"
                  onClick={voice.stop}
                >
                  <Square />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Descartar gravação"
                  title="Descartar gravação"
                  onClick={voice.cancel}
                >
                  <X />
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Gravar áudio"
                title="Gravar áudio"
                disabled={!!file}
                onClick={() => void voice.start()}
              >
                <Mic />
              </Button>
            ))}
          {!isNote && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={askSuggestions}
              disabled={suggest.isPending}
              className="text-primary hover:text-primary"
            >
              {suggest.isPending ? <Loader2 className="animate-spin" /> : <Bot />}
              Sugerir com IA
            </Button>
          )}
          {!isNote && (
            <MacroSuggest
              accountId={accountId}
              conversationId={conversation.id}
              onPick={(t) => {
                setText(t);
                textareaRef.current?.focus();
              }}
            />
          )}
          <span className="ml-auto hidden text-[11px] whitespace-nowrap text-subtle 2xl:inline">
            Enter envia · Shift+Enter quebra linha
          </span>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!canSend}
            className="ml-auto shrink-0 2xl:ml-2"
          >
            {isNote ? "Salvar nota" : "Enviar"}
            {note.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
      </div>
      {channel && isOfficialWhatsApp(channel) && (
        <TemplatePicker
          accountId={accountId}
          conversationId={conversation.id}
          channelId={channel.id}
          contactName={contactName}
          open={templateOpen}
          onOpenChange={setTemplateOpen}
        />
      )}
    </div>
  );
}

interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Lock;
  label: string;
}

function ModeButton({ active, onClick, icon: Icon, label }: ModeButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
