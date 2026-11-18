import { Fragment, useMemo, type ReactNode } from "react";
import { History, Bot } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

import {
  useContactActivities,
  useContactClassifications,
  useContactConversations,
  useTeamMembers,
} from "../../api";
import { activityMeta } from "./activityMeta";
import { TimelineItem } from "./TimelineItem";

type Entry = { key: string; at: string; node: ReactNode };

type Props = { accountId: string; contactId: string };

// Tudo o que aconteceu com a pessoa, numa linha só: atividades, leituras da IA e conversas.
export function ContactTimeline({ accountId, contactId }: Props) {
  const activities = useContactActivities(accountId, contactId);
  const classifications = useContactClassifications(accountId, contactId);
  const conversations = useContactConversations(accountId, contactId);
  const team = useTeamMembers(accountId);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const a of activities.data ?? []) {
      const meta = activityMeta(a.type);
      const Icon = meta.icon;
      out.push({
        key: `a-${a.id}`,
        at: a.created_at,
        node: (
          <TimelineItem
            icon={<Icon className="size-3.5" />}
            tone={meta.tone}
            title={a.type === "note" ? "Nota" : a.title}
            at={a.created_at}
            meta={a.user_id ? names.get(a.user_id) : undefined}
          >
            {a.body}
          </TimelineItem>
        ),
      });
    }
    for (const c of classifications.data ?? []) {
      out.push({
        key: `c-${c.id}`,
        at: c.created_at,
        node: (
          <TimelineItem
            icon={<Bot className="size-3.5" />}
            tone="bg-primary-soft text-primary border-primary-line"
            title="IA atualizou o resumo do cliente"
            at={c.created_at}
            meta={c.intent ?? undefined}
          >
            {c.summary}
          </TimelineItem>
        ),
      });
    }
    for (const cv of conversations.data ?? []) {
      if (!cv.lastMessageAt) continue;
      out.push({
        key: `v-${cv.id}`,
        at: cv.lastMessageAt,
        node: (
          <TimelineItem
            icon={<ChannelIcon platform={cv.platform} size={14} />}
            tone="bg-surface border-border"
            title={`Conversa no ${PLATFORM_LABEL[cv.platform] ?? cv.platform}`}
            at={cv.lastMessageAt}
            meta={cv.channelName}
          >
            {cv.preview}
          </TimelineItem>
        ),
      });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [activities.data, classifications.data, conversations.data, names]);

  if (activities.isPending || classifications.isPending || conversations.isPending) {
    return (
      <div className="space-y-3" aria-busy>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (activities.isError || classifications.isError || conversations.isError) {
    return (
      <p className="text-[13px] text-danger">
        Não deu para carregar a linha do tempo. Recarregue a página.
      </p>
    );
  }
  if (!entries.length) {
    return (
      <EmptyState
        icon={History}
        title="Nada por aqui ainda"
        description="Conversas, notas, mudanças de etapa e leituras da IA aparecem nesta linha do tempo."
        className="py-10"
      />
    );
  }
  return (
    <ol className="pt-1">
      {entries.map((e) => (
        <Fragment key={e.key}>{e.node}</Fragment>
      ))}
    </ol>
  );
}
