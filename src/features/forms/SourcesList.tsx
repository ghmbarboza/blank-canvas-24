import { Link, useNavigate } from "@tanstack/react-router";
import {
  Code,
  ExternalLink,
  LayoutTemplate,
  Link2,
  Loader2,
  MessageCircle,
  Plug,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useForms, useSaveForm, useWebchatChannels, useWeeklyEntries, type FormRow } from "./api";
import { copyText } from "./copy-text";
import { formEmbedCode, ownerModeLabel, SOURCE_LABEL } from "./sources";
import { DEFAULT_FIELDS } from "./types";

type Props = { accountId: string; onOpenChat: () => void };

// Portas de entrada: cada formulário, o chat do site e as outras origens que trouxeram gente na semana.
export function SourcesList({ accountId, onOpenChat }: Props) {
  const { isManager } = useAccount();
  const forms = useForms(accountId);
  const week = useWeeklyEntries(accountId);
  const chats = useWebchatChannels(accountId);
  const save = useSaveForm(accountId);
  const navigate = useNavigate();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function create() {
    try {
      const f = await save.mutateAsync({
        name: "Novo formulário",
        title: "Fale com a gente",
        fields: DEFAULT_FIELDS,
      });
      void navigate({ to: "/formularios/$formId", params: { formId: f.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (forms.isPending)
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-[24px]" />
        ))}
      </div>
    );
  if (forms.isError)
    return (
      <p className="rounded-2xl border border-danger/40 px-4 py-6 text-center text-[13px] text-danger">
        {errorMessage(forms.error)}
      </p>
    );

  const list = forms.data ?? [];
  const chat = chats.data?.[0];
  const others = [...(week.data?.bySource.entries() ?? [])]
    .filter(([src]) => !(src === "webchat" && chat))
    .sort((a, b) => b[1] - a[1]);
  const weekly = (n: number | undefined) => (week.isPending ? "…" : formatNumber(n ?? 0));

  return (
    <div className="space-y-5">
      {list.length > 0 && (
        <ul className="space-y-4">
          {list.map((f) => (
            <FormCard
              key={f.id}
              f={f}
              weekly={weekly(week.data?.byForm.get(f.id))}
              link={`${origin}/f/${f.id}`}
              embed={formEmbedCode(origin, accountId, f.id)}
            />
          ))}
        </ul>
      )}

      {(chat || others.length > 0) && (
        <ul className="space-y-4">
          {chat && (
            <SourceCard
              live={chat.status === "connected"}
              liveLabel="no ar"
              title={chat.name || "Chat do site"}
              pills={[chat.ai_enabled ? "IA responde" : "equipe responde", "chat do site"]}
              weekly={weekly(week.data?.bySource.get("webchat"))}
              total={null}
              action={
                <Button variant="outline" size="sm" onClick={onOpenChat}>
                  <MessageCircle /> Configurar
                </Button>
              }
            />
          )}
          {others.map(([src, n]) => (
            <SourceCard
              key={src}
              live
              liveLabel="trouxe gente esta semana"
              title={SOURCE_LABEL[src] ?? src}
              pills={["sem formulário próprio"]}
              weekly={formatNumber(n)}
              total={null}
              action={null}
            />
          ))}
        </ul>
      )}

      <NextDoor
        hasAny={list.length > 0 || Boolean(chat)}
        isManager={isManager}
        hasChat={Boolean(chat)}
        creating={save.isPending}
        onCreate={() => void create()}
        onOpenChat={onOpenChat}
      />
    </div>
  );
}

function FormCard({
  f,
  weekly,
  link,
  embed,
}: {
  f: FormRow;
  weekly: string;
  link: string;
  embed: string;
}) {
  const live = f.status === "active";
  return (
    <SourceCard
      live={live}
      liveLabel={live ? "recebendo respostas" : "pausado"}
      title={f.name}
      titleTo={f.id}
      pills={[
        `${f.fields.length} ${f.fields.length === 1 ? "campo" : "campos"}`,
        ownerModeLabel(f.destination.owner_mode),
      ]}
      weekly={weekly}
      total={formatNumber(f.submissions_count)}
      action={
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => copyText(embed)}>
            <Code /> Copiar código
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => copyText(link)}
            aria-label={`Copiar link de ${f.name}`}
          >
            <Link2 />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a
              href={`/f/${f.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${f.name} em nova aba`}
            >
              <ExternalLink />
            </a>
          </Button>
        </div>
      }
    />
  );
}

function SourceCard({
  live,
  liveLabel,
  title,
  titleTo,
  pills,
  weekly,
  total,
  action,
}: {
  live: boolean;
  liveLabel: string;
  title: string;
  titleTo?: string;
  pills: string[];
  weekly: string;
  total: string | null;
  action: ReactNode;
}) {
  return (
    <li className="group lift relative overflow-hidden rounded-[24px] border border-border bg-surface p-5 sm:p-7">
      <span
        className="absolute inset-y-0 left-0 w-1 bg-border transition-colors duration-300 group-hover:bg-primary"
        aria-hidden
      />
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <span
              className={cn("size-2 rounded-full", live ? "bg-success" : "bg-border-strong")}
              aria-hidden
            />
            {liveLabel}
          </p>
          {titleTo ? (
            <Link
              to="/formularios/$formId"
              params={{ formId: titleTo }}
              className="block truncate font-display text-[20px] font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {title}
            </Link>
          ) : (
            <p className="truncate font-display text-[20px] font-semibold">{title}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p) => (
              <span
                key={p}
                className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
        <dl className="flex shrink-0 items-center gap-8 md:w-64 md:border-l md:border-border md:pl-8">
          <div>
            <dd className="font-display text-[28px] leading-none font-semibold tabular-nums">
              {weekly}
            </dd>
            <dt className="mt-1.5 text-[11px] text-subtle">entradas em 7 dias</dt>
          </div>
          {total !== null && (
            <div>
              <dd className="font-display text-[28px] leading-none font-semibold tabular-nums">
                {total}
              </dd>
              <dt className="mt-1.5 text-[11px] text-subtle">no total</dt>
            </div>
          )}
        </dl>
        <div className="shrink-0 md:flex md:w-[232px] md:justify-end">{action}</div>
      </div>
    </li>
  );
}

// Próxima porta: o estado vazio que ensina, e o convite para abrir mais uma entrada quando já há.
function NextDoor({
  hasAny,
  isManager,
  hasChat,
  creating,
  onCreate,
  onOpenChat,
}: {
  hasAny: boolean;
  isManager: boolean;
  hasChat: boolean;
  creating: boolean;
  onCreate: () => void;
  onOpenChat: () => void;
}) {
  return (
    <section className="flex flex-col items-center gap-6 rounded-[24px] border-2 border-dashed border-border bg-surface-2/40 p-6 text-center sm:p-10 md:flex-row md:text-left">
      <span className="grid size-16 shrink-0 place-items-center rounded-full border border-border bg-surface">
        <Plug className="size-6 text-subtle" aria-hidden />
      </span>
      <div className="flex-1 space-y-3">
        <h2 className="font-display text-[18px] font-medium">
          {hasAny ? "Abra mais uma porta de entrada" : "Nenhuma porta de entrada ainda"}
        </h2>
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {hasAny
            ? "Um formulário para cada página ou anúncio mostra de onde vem cada cliente. Quem preenche vira contato com origem, consentimento e responsável."
            : "Crie um formulário, cole no seu site ou mande o link. Cada resposta vira contato com origem, consentimento e responsável, e cai direto no atendimento."}
        </p>
        {isManager && (
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            <Button onClick={onCreate} disabled={creating}>
              {creating ? <Loader2 className="animate-spin" /> : <Plus />} Novo formulário
            </Button>
            <Button variant="outline" asChild>
              <Link to="/formularios/paginas">
                <LayoutTemplate /> Criar página
              </Link>
            </Button>
            {!hasChat && (
              <Button variant="outline" onClick={onOpenChat}>
                <MessageCircle /> Ligar o chat do site
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
