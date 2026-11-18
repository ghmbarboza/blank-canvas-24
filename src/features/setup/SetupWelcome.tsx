// Boas-vindas do primeiro acesso: a assistente explica o que vai ser configurado e a pessoa escolhe
// como prefere fazer, pela conversa ou pelo formulário passo a passo. Os dois caminhos gravam nos
// mesmos lugares, então dá para trocar de um para o outro quando quiser.
import { ArrowRight, Check, ListChecks, MessageCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";

const WHAT = [
  "Os dados da sua empresa e o jeito de falar com o cliente",
  "O WhatsApp conectado por QR Code",
  "A base de conhecimento, com o que o atendente precisa saber",
  "O atendente de IA, criado e testado",
  "As regras de pós-venda: boas-vindas, pesquisa, recompra",
  "Um teste de verdade no seu número",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChat: () => void;
  onForm: () => void;
}

export function SetupWelcome({ open, onOpenChange, onChat, onForm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <div className="bg-primary px-6 pt-7 pb-6 text-primary-foreground sm:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/nexa/guia.png"
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-full border border-white/20 object-cover"
            />
            <p className="text-[13px] opacity-80">
              {BRAND.assistant}, {BRAND.assistantRole}
            </p>
          </div>
          <DialogHeader className="mt-4 space-y-2 text-left">
            <DialogTitle className="font-display text-[26px] leading-tight font-extrabold text-primary-foreground">
              Oi, eu sou a {BRAND.assistant}. Vamos deixar a sua {BRAND.name} funcionando.
            </DialogTitle>
            <DialogDescription className="text-[14px] text-primary-foreground/80">
              São seis passos e leva cerca de vinte minutos. No fim, o seu pós-venda já atende
              sozinho no WhatsApp.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-6 sm:px-8">
          <section aria-labelledby="welcome-what">
            <h3
              id="welcome-what"
              className="text-[12px] font-semibold tracking-wide text-subtle uppercase"
            >
              O que a gente vai configurar
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {WHAT.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[13.5px]">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[color:var(--gold-text)]"
                    aria-hidden
                  />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="welcome-how">
            <h3
              id="welcome-how"
              className="text-[12px] font-semibold tracking-wide text-subtle uppercase"
            >
              Como você prefere fazer
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onChat}
                className="group rounded-2xl border-2 border-[color:var(--action)] bg-surface p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-center gap-2">
                  <MessageCircle className="size-5" aria-hidden />
                  <span className="text-[15px] font-semibold">
                    Conversando com a {BRAND.assistant}
                  </span>
                </span>
                <span className="mt-1 inline-block rounded-full bg-[color:var(--action)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--action-fg,#001f35)]">
                  Mais rápido
                </span>
                <span className="mt-2 block text-[13px] text-muted-foreground">
                  Você conta do seu jeito e ela faz. Cole o endereço do site e ela preenche a
                  empresa e o que vocês vendem. Mostra o QR Code do WhatsApp na própria conversa.
                </span>
                <span className="mt-3 flex items-center gap-1 text-[13px] font-semibold">
                  Começar a conversa
                  <ArrowRight
                    className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={onForm}
                className="group rounded-2xl border border-border bg-surface p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-center gap-2">
                  <ListChecks className="size-5" aria-hidden />
                  <span className="text-[15px] font-semibold">Pelo formulário, passo a passo</span>
                </span>
                <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold">
                  Mais controle
                </span>
                <span className="mt-2 block text-[13px] text-muted-foreground">
                  Seis telas, um botão por vez. Você vê cada campo, confere e decide tudo. Bom para
                  quem gosta de acompanhar item por item.
                </span>
                <span className="mt-3 flex items-center gap-1 text-[13px] font-semibold">
                  Abrir o passo a passo
                  <ArrowRight
                    className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </button>
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Os dois chegam ao mesmo lugar, e dá para trocar de um para o outro quando quiser.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
