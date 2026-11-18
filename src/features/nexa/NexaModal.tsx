// A conversa com a Vi (a guia de implantação): uma conversa só, caixa de texto embaixo, e o que
// ela precisa de clique (opções, formulário, cartões, conexões) dentro da própria resposta.
// Fala com voz (opcional) e guarda o que aprende. É a ajuda ao lado do passo a passo: os botões
// "Fazer pela tela" levam de volta ao formulário do passo.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { Brain, Check, ListChecks, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { chapters, currentChapter, type ChapterState } from "@/backend/setup-agent/soul";
import { useSetupFacts, useUploadDocuments } from "@/features/setup-chat/api";
import { SidePanel } from "@/features/setup-chat/SidePanel";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { Composer } from "./Composer";
import { RoteiroStrip } from "./RoteiroStrip";
import { NexaFace, Thread } from "./Thread";
import { useNexa } from "./useNexa";
import { useVoice } from "./useVoice";

const STARTERS = [
  { label: "Contar sobre a empresa", text: "Vou te contar sobre a empresa: " },
  { label: "Conectar o WhatsApp", text: "Quero conectar o WhatsApp da empresa" },
  { label: "Ensinar o atendente", text: "Tenho documentos para o atendente aprender" },
  { label: "Regras de pós-venda", text: "Quais regras de pós-venda eu posso ligar?" },
];

function greeting(name: string, ready: boolean): { title: string; text: string } {
  const hi = `Oi${name ? `, ${name}` : ""}! Eu sou a ${BRAND.assistant}.`;
  if (ready) return { title: hi, text: "O pós-venda está de pé. O que você quer ajustar hoje?" };
  return {
    title: hi,
    text: "Estou aqui para ajudar a deixar o pós-venda da sua empresa funcionando no WhatsApp. Para começar: qual é o nome da empresa e o que vocês vendem?",
  };
}

function SoulMeter({ list, onClick }: { list: ChapterState[]; onClick: () => void }) {
  const done = list.filter((c) => c.done).length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`O que a ${BRAND.assistant} já sabe: ${done} de ${list.length} assuntos`}
      className="flex items-center gap-2.5 rounded-full border border-border px-3 py-1.5 text-[12.5px] transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden className="flex gap-[3px]">
        {list.map((c) => (
          <span
            key={c.id}
            className={cn(
              "h-3 w-1 rounded-full",
              c.done ? "bg-[hsl(var(--nexa-accent))]" : "bg-foreground/15",
            )}
          />
        ))}
      </span>
      <span className="hidden sm:inline">
        O que a {BRAND.assistant} sabe: {done} de {list.length}
      </span>
      <Brain className="size-3.5 text-muted-foreground sm:hidden" />
    </button>
  );
}

function Chapters({ list }: { list: ChapterState[] }) {
  const now = currentChapter(list);
  return (
    <ol className="mb-5 grid gap-1.5">
      {list.map((c) => (
        <li key={c.id} className="flex items-center gap-2.5 text-[13.5px]">
          <span
            className={cn(
              "grid size-4 place-items-center rounded-full border",
              c.done
                ? "border-[hsl(var(--nexa-accent))] bg-[hsl(var(--nexa-accent))] text-white"
                : "border-foreground/25",
            )}
          >
            {c.done ? <Check className="size-2.5" /> : null}
          </span>
          <span className={cn(c.id === now?.id && !c.done && "font-semibold")}>{c.label}</span>
          <span className="ml-auto text-[12px] text-muted-foreground">
            {c.facts ? `${c.facts} anotado${c.facts > 1 ? "s" : ""}` : c.done ? "pronto" : "falta"}
          </span>
        </li>
      ))}
    </ol>
  );
}

const ICON_BTN =
  "grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  accountId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  segment: string | null;
  /** abre o passo a passo (Primeiros passos), direto num passo se vier o id */
  onOpenStep?: (step?: string) => void;
};

export function NexaModal({ accountId, open, onOpenChange, segment, onOpenStep }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = (user?.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0] ?? "";
  const nexa = useNexa(accountId, name);
  const facts = useSetupFacts(accountId);
  const upload = useUploadDocuments(accountId);
  const [text, setText] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice((heard, final) => {
    setText(heard);
    if (final && heard.trim()) {
      nexa.send(heard);
      setText("");
    }
  });

  const list = useMemo(
    () =>
      chapters(facts.data ?? [], {
        company: "",
        segment,
        ai: "",
        aiMode: null,
        integrations: [],
        channels: [],
        agents: [],
        team: 0,
        documents: 0,
        wishes: 0,
        modules: [],
        rulesOn: 0,
        firstWin: { received: false, replied: false, deal: false },
      }),
    [facts.data, segment],
  );
  const ready = list.every((c) => c.done);
  const hello = greeting(name, ready);
  const lastAssistant = [...nexa.turns].reverse().find((t) => t.role === "assistant");
  const busy = nexa.busy || upload.isPending;

  // fala a resposta quando a rodada termina (não a cada pedaço do stream)
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !nexa.busy && lastAssistant?.text) voice.speak(lastAssistant.text);
    wasBusy.current = nexa.busy;
  }, [nexa.busy, lastAssistant?.text, voice]);

  useEffect(() => {
    if (!open) voice.stopSpeaking();
  }, [open, voice]);

  function submit(value = text) {
    const v = value.trim();
    if (!v || busy) return;
    setText("");
    nexa.send(v);
  }

  function attach(files: FileList | null) {
    const picked = [...(files ?? [])];
    if (!picked.length) return;
    upload.mutate(picked, {
      onSuccess: (r) => {
        const ok = r.filter((x) => x.ok).map((x) => x.name);
        for (const b of r.filter((x) => !x.ok)) toast.error(`${b.name}: ${b.error}`);
        if (ok.length) submit(`Enviei para a biblioteca: ${ok.join(", ")}.`);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  function pickStarter(s: (typeof STARTERS)[number]) {
    // começo de frase vai para a caixa (a pessoa completa); pedido completo vai direto
    if (s.text.endsWith(" ")) {
      setText(s.text);
      requestAnimationFrame(() => box.current?.focus());
    } else submit(s.text);
  }

  function openScreen(to: string) {
    // "passo:<id>" vem do botão "Fazer pela tela": troca a conversa pelo formulário do passo
    if (to.startsWith("passo:")) {
      onOpenStep?.(to.slice("passo:".length));
      return;
    }
    onOpenChange(false);
    void navigate({ to });
  }

  const empty = !nexa.loading && nexa.turns.length === 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(214_70%_9%/0.6)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            box.current?.focus();
          }}
          className={cn(
            "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none",
            "md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(780px,calc(100dvh-48px))] md:w-[min(880px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:shadow-[0_40px_120px_-20px_rgb(0_0_0/0.45)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
            <NexaFace className="size-9" />
            <div className="min-w-0 leading-tight">
              <DialogPrimitive.Title className="text-[15px] font-semibold">
                {BRAND.assistant}, {BRAND.assistantRole}
              </DialogPrimitive.Title>
              <p className="truncate text-[12px] text-muted-foreground">
                {nexa.working ? `${nexa.working}…` : "Tira dúvidas e faz os passos com você"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {onOpenStep ? (
                <button
                  type="button"
                  onClick={() => onOpenStep()}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ListChecks className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Passo a passo</span>
                  <span className="sr-only sm:hidden">Passo a passo</span>
                </button>
              ) : null}
              <SoulMeter list={list} onClick={() => setMemoryOpen((v) => !v)} />
              {voice.canSpeak ? (
                <button
                  type="button"
                  onClick={voice.toggleMute}
                  aria-label={
                    voice.muted
                      ? `Ligar a voz da ${BRAND.assistant}`
                      : `Silenciar a ${BRAND.assistant}`
                  }
                  aria-pressed={!voice.muted}
                  className={ICON_BTN}
                >
                  {voice.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
              ) : null}
              <DialogPrimitive.Close aria-label="Fechar" className={ICON_BTN}>
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </header>
          <RoteiroStrip
            accountId={accountId}
            onOpen={() => (onOpenStep ? onOpenStep() : setMemoryOpen(true))}
          />

          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
                  {nexa.loading ? (
                    <div className="grid gap-4" aria-busy>
                      <div className="h-5 w-2/3 animate-pulse rounded-lg bg-surface-2" />
                      <div className="h-5 w-1/2 animate-pulse rounded-lg bg-surface-2" />
                    </div>
                  ) : empty ? (
                    <div className="flex flex-col items-center pt-[6vh] text-center">
                      <div className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-0 rounded-full border border-[hsl(var(--nexa-accent)/0.35)]",
                            voice.speaking && "animate-[nexa-pulse_1.8s_ease-out_infinite]",
                          )}
                        />
                        <NexaFace className="size-24" />
                      </div>
                      <h2 className="mt-5 text-[24px] font-medium tracking-tight">{hello.title}</h2>
                      <p className="mt-2 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground">
                        {hello.text}
                      </p>
                    </div>
                  ) : (
                    <Thread
                      turns={nexa.turns}
                      working={nexa.working}
                      error={nexa.error}
                      onRetry={nexa.retry}
                      isBusy={busy}
                      onAnswer={(t) => submit(t)}
                      onOpen={openScreen}
                    />
                  )}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[720px] px-4 pb-4 md:px-6 md:pb-5">
                {empty ? (
                  <div className="mb-3 flex flex-wrap justify-center gap-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => pickStarter(s)}
                        className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] transition hover:border-foreground/30 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Composer
                  value={text}
                  onChange={setText}
                  onSubmit={() => submit()}
                  onStop={() => void nexa.stop()}
                  onFiles={attach}
                  isStreaming={nexa.busy}
                  isUploading={upload.isPending}
                  canListen={voice.canListen}
                  isListening={voice.listening}
                  onListen={voice.listen}
                  inputRef={box}
                />
                <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
                  A {BRAND.assistant} ajuda e guarda o que você conta. Prefere formulário e botão?
                  Use o passo a passo: o que faltar fica no aviso do menu.
                </p>
              </div>
            </div>

            {memoryOpen ? (
              <aside
                aria-label={`O que a ${BRAND.assistant} já sabe`}
                className="absolute inset-0 z-10 overflow-y-auto border-l border-border bg-background p-5 md:static md:w-[360px] md:shrink-0"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[15px] font-medium">O que já sei</h3>
                  <button
                    type="button"
                    onClick={() => setMemoryOpen(false)}
                    aria-label="Fechar o que já sei"
                    className={ICON_BTN}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  O que já aprendi
                </p>
                <Chapters list={list} />
                <SidePanel accountId={accountId} />
              </aside>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
