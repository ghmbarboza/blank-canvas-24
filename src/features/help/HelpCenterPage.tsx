import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CircleHelp,
  Headphones,
  Inbox,
  KanbanSquare,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";

import { HelpPage, type SecaoAjuda } from "@/components/common/HelpPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

import { atualizadoEm, faq, guideBySlug, temas, type HelpGuide } from "./content";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

const ICONES: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  agente: Bot,
  ligacoes: Headphones,
  agenda: CalendarDays,
  atender: Inbox,
  vender: KanbanSquare,
  equipe: Users,
};

function GuiaResumo({ guia }: { guia: HelpGuide }) {
  return (
    <div className="border-t border-[var(--via-border-soft)] pt-3 first:border-t-0 first:pt-0">
      <p className="font-medium text-[var(--via-text-primary)]">{guia.titulo}</p>
      <p className="text-[var(--via-text-muted)]">{guia.resumo}</p>
      <ol className="mt-2">
        {guia.passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <Link
        to="/central-de-ajuda/$slug"
        params={{ slug: guia.slug }}
        className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--via-text-primary)] underline-offset-4 hover:underline"
      >
        Abrir o guia
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export function HelpCenterPage() {
  const secoes = useMemo<SecaoAjuda[]>(
    () => [
      ...temas.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        icon: ICONES[t.id] ?? CircleHelp,
        conteudo: (
          <div className="space-y-4">
            {t.guias
              .map((slug) => guideBySlug(slug))
              .filter((g): g is HelpGuide => Boolean(g))
              .map((g) => (
                <GuiaResumo key={g.slug} guia={g} />
              ))}
          </div>
        ),
      })),
      {
        id: "duvidas",
        titulo: "Dúvidas comuns",
        icon: CircleHelp,
        conteudo: (
          <div className="space-y-4">
            {faq.map((f) => (
              <div key={f.pergunta}>
                <p className="font-medium text-[var(--via-text-primary)]">{f.pergunta}</p>
                <p className="text-[var(--via-text-muted)]">{f.resposta}</p>
              </div>
            ))}
            <p className="text-[12px] text-[var(--via-text-soft)]">
              Atualizado em {dataBr(atualizadoEm)}.
            </p>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Ajuda"
        description="Guias passo a passo e respostas para as dúvidas mais comuns do Nexus."
      />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <HelpPage
          placeholderBusca="Buscar: WhatsApp, campanha, ligação, convite, chave, IA…"
          secoes={secoes}
          atalhos={[
            { pergunta: "Como conectar o WhatsApp da empresa", secao: "whatsapp" },
            { pergunta: "Como ligar e atender pelo navegador", secao: "ligacoes" },
            { pergunta: "O convite não chegou por e-mail", secao: "duvidas" },
            { pergunta: "Por que a IA não respondeu?", secao: "duvidas" },
          ]}
          naoAchou={{
            texto: "A Nexa responde dúvidas sobre a configuração, conversando.",
            acao: (
              <Button asChild>
                <Link to="/painel">Voltar ao Painel</Link>
              </Button>
            ),
          }}
        />
      </div>
    </div>
  );
}
