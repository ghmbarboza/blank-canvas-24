import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Delete,
  Headphones,
  Lightbulb,
  Loader2,
  Mic,
  Phone,
  PhoneCall,
  Smartphone,
  Bot,
  X,
} from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useContactSearch } from "@/features/contacts/api";
import { useDebounced } from "@/features/contacts/useDebounced";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

import { formatDuration } from "../lib";
import { useSoftphone } from "./softphone-context";
import { CallTransfer } from "./CallTransfer";
import { useCallCoach } from "./useCallCoach";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const TIP_TONE: Record<string, string> = {
  objection: "border-l-[#B85C5C]",
  closing: "border-l-[#1F8A5B]",
  compliance: "border-l-[#B85C5C]",
  pace: "border-l-[#0A1F3B]",
  question: "border-l-[#0A1F3B]",
  info: "border-l-border-strong",
};

// Telefone flutuante do vendedor: discar, buscar contato, ver a ligação e o coach ao vivo.
// O áudio, o mudo, a espera e a transferência ficam nos controles do widget da Zadarma.
// `available` segue a regra do item "Ligações" do menu (needs: "zadarma"): sem telefonia ligada,
// o botão não aparece, salvo se já houver uma ligação em curso.
export function Softphone({ available }: { available: boolean }) {
  const sp = useSoftphone();
  const [number, setNumber] = useState("");
  const [q, setQ] = useState("");
  const term = useDebounced(q, 250);
  const search = useContactSearch(sp?.accountId ?? "", term, Boolean(sp?.open && term.length >= 2));
  const call = sp?.activeCall ?? null;
  // Na conversa, no celular, o botão cobriria o Enviar: some até haver ligação ou o telefone abrir.
  const inConversation = useRouterState({
    select: (st) => st.location.pathname.startsWith("/inbox/"),
  });
  const coach = useCallCoach(
    sp?.accountId ?? "",
    call?.contact_id ?? sp?.target?.contactId ?? null,
  );
  if (!sp) return null;
  if (!available && !call && !sp.open) return null;

  const listening = coach.status === "listening" || coach.status === "no_remote";
  const elapsed = call
    ? Math.round((Date.now() - new Date(call.answered_at ?? call.started_at).getTime()) / 1000)
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => sp.setOpen(!sp.open)}
        aria-label={sp.open ? "Fechar telefone" : "Abrir telefone"}
        className={cn(
          "fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-full shadow-[0_12px_32px_rgba(10,31,59,0.35)] transition-transform hover:scale-105",
          inConversation && !call && !sp.open && "max-sm:hidden",
          call ? "bg-[#1F8A5B] text-white" : "bg-[#0A1F3B] text-white",
        )}
      >
        {call ? <PhoneCall className="size-6 animate-pulse" /> : <Phone className="size-6" />}
      </button>

      {sp.open && (
        <section
          aria-label="Telefone"
          className="fixed right-5 bottom-24 z-40 flex max-h-[min(720px,calc(100dvh-120px))] w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-[28px] border border-border bg-surface shadow-[0_24px_60px_rgba(10,31,59,0.28)]"
        >
          <header className="relative overflow-hidden bg-[#0A1F3B] px-5 py-4 text-white">
            <div
              className="hero-orb pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-white/10 blur-2xl"
              aria-hidden
            />
            <div className="relative flex items-center gap-3">
              <Headphones className="size-4 text-white/70" aria-hidden />
              <p className="flex-1 text-[13px] font-semibold">Telefone</p>
              <span className="text-[11px] text-white/60">
                {sp.widget === "ready"
                  ? "Navegador conectado"
                  : sp.widget === "loading"
                    ? "Conectando…"
                    : "Navegador desconectado"}
              </span>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => sp.setOpen(false)}
                className="rounded-full p-1 text-white/70 hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </div>
            {call ? (
              <div className="relative mt-3">
                <p className="text-[11px] tracking-[0.14em] text-white/60 uppercase">
                  {call.status === "ringing" ? "Chamando" : "Em ligação"}
                </p>
                <p className="font-display text-[20px] font-semibold">
                  {sp.target?.name ??
                    formatPhone(call.direction === "inbound" ? call.from_number : call.to_number)}
                </p>
                <p className="text-[12px] text-white/60 tabular-nums">
                  {call.status === "in_progress" ? formatDuration(elapsed) : "aguardando atender"}
                </p>
                {call.contact_id && (
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: call.contact_id }}
                    className="mt-1 inline-block text-[12px] underline underline-offset-2"
                  >
                    Abrir ficha do contato
                  </Link>
                )}
              </div>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {sp.widget !== "ready" && (
              <div className="rounded-2xl border border-dashed border-border p-3 text-[12px] text-muted-foreground">
                {sp.widget === "error" ? (
                  <p className="flex items-start gap-2 text-danger">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {sp.widgetError}
                  </p>
                ) : (
                  <p>Conecte o telefone do navegador para atender e fazer ligações por aqui.</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void sp.loadWidget()}
                  disabled={sp.widget === "loading"}
                >
                  {sp.widget === "loading" ? <Loader2 className="animate-spin" /> : <Headphones />}{" "}
                  Conectar telefone
                </Button>
              </div>
            )}

            {!call && (
              <>
                <div className="relative">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar contato para ligar"
                    aria-label="Buscar contato"
                  />
                  {term.length >= 2 && (search.data ?? []).length > 0 && (
                    <ul className="absolute inset-x-0 top-11 z-10 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface p-1">
                      {(search.data ?? [])
                        .filter((c) => c.phone)
                        .map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setQ("");
                                void sp.dial({ contactId: c.id, phone: c.phone, name: c.name });
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                            >
                              <ContactAvatar name={c.name} src={c.avatar_url} size={28} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px]">
                                  {c.name ?? "Sem nome"}
                                </span>
                                <span className="block truncate text-[11px] text-subtle">
                                  {formatPhone(c.phone)}
                                </span>
                              </span>
                              <Phone className="size-3.5 text-subtle" />
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={number}
                    onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#() -]/g, ""))}
                    placeholder="(48) 99999-0000"
                    inputMode="tel"
                    aria-label="Número"
                    className="font-display text-[18px] tracking-wide tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Apagar"
                    onClick={() => setNumber((n) => n.slice(0, -1))}
                    className="rounded-full p-2 text-subtle hover:bg-surface-2"
                  >
                    <Delete className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setNumber((n) => n + k)}
                      className="row-wash h-11 rounded-2xl border border-border font-display text-[17px] font-medium tabular-nums"
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => void sp.dial({ phone: number })}
                    disabled={!number || sp.dialing}
                    className="h-11 rounded-2xl"
                  >
                    {sp.dialing ? <Loader2 className="animate-spin" /> : <Phone />} Ligar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void sp.dial({ phone: number }, "mobile")}
                    disabled={!number || sp.dialing}
                    className="h-11 rounded-2xl"
                    title="A Zadarma liga primeiro para o seu celular"
                  >
                    <Smartphone /> Pelo celular
                  </Button>
                </div>
              </>
            )}

            {call && call.status === "in_progress" && sp.accountId && (
              <CallTransfer accountId={sp.accountId} />
            )}
            {call && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow flex items-center gap-1.5">
                    <Bot className="size-3.5" /> Coach ao vivo
                  </p>
                  {listening ? (
                    <Button size="sm" variant="outline" onClick={coach.stop}>
                      Parar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void coach.start()}
                      disabled={coach.status === "starting"}
                    >
                      {coach.status === "starting" ? <Loader2 className="animate-spin" /> : <Mic />}{" "}
                      Ligar coach
                    </Button>
                  )}
                </div>
                {coach.status === "no_remote" && (
                  <p className="text-[11px] text-subtle">
                    Ouvindo só o seu microfone. A voz do cliente entra quando a ligação conectar no
                    navegador.
                  </p>
                )}
                {coach.error && <p className="text-[12px] text-danger">{coach.error}</p>}
                <ul className="space-y-2">
                  {coach.tips.slice(0, 4).map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "rounded-2xl border border-l-4 border-border bg-surface-2/60 px-3 py-2",
                        TIP_TONE[t.kind],
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold">
                        <Lightbulb className="size-3.5" /> {t.title}
                        {t.source === "ai" && (
                          <span className="text-[10px] font-normal text-subtle">IA</span>
                        )}
                      </p>
                      <p className="text-[12px] text-muted-foreground">{t.text}</p>
                    </li>
                  ))}
                  {listening && coach.tips.length === 0 && (
                    <li className="text-[12px] text-subtle">
                      As dicas aparecem aqui conforme a conversa.
                    </li>
                  )}
                </ul>
                {listening && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl bg-surface-2/50 p-3 text-[12px]">
                    {coach.segments.slice(-8).map((s, i) => (
                      <p key={i}>
                        <span className="font-semibold">
                          {s.speaker === "seller" ? "Você" : "Cliente"}:
                        </span>{" "}
                        {s.text}
                      </p>
                    ))}
                    {(coach.interim.seller || coach.interim.customer) && (
                      <p className="text-subtle italic">
                        {coach.interim.customer || coach.interim.seller}…
                      </p>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-subtle">
                  Mudo, espera e transferência ficam nos botões do telefone do navegador (canto
                  inferior).
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
