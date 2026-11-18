import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { activityMeta } from "@/features/contacts/components/detail/activityMeta";
import { TimelineItem } from "@/features/contacts/components/detail/TimelineItem";
import type { TeamMember } from "@/features/contacts/types";

import { useAddDealNote, useDealActivities } from "../api";

type Props = {
  accountId: string;
  dealId: string;
  contactId: string | null;
  members: Map<string, TeamMember>;
};

export function DealTimeline({ accountId, dealId, contactId, members }: Props) {
  const { user } = useAuth();
  const activities = useDealActivities(accountId, dealId);
  const addNote = useAddDealNote(accountId);
  const [body, setBody] = useState("");

  async function submit() {
    const text = body.trim();
    if (!text || !user) return;
    try {
      await addNote.mutateAsync({ dealId, contactId, body: text.slice(0, 5000), userId: user.id });
      setBody("");
      toast.success("Nota adicionada");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <section aria-labelledby="deal-timeline" className="space-y-3">
      <h3
        id="deal-timeline"
        className="text-[11px] font-medium tracking-widest text-subtle uppercase"
      >
        Linha do tempo
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="rounded-xl border border-note-line bg-note p-2.5"
      >
        <label htmlFor="deal-note" className="sr-only">
          Nova nota
        </label>
        <Textarea
          id="deal-note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder="Adicionar nota sobre este cliente"
          className="min-h-16 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
        />
        <div className="mt-1.5 flex justify-end">
          <Button type="submit" size="sm" disabled={!body.trim() || addNote.isPending}>
            {addNote.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar nota
          </Button>
        </div>
      </form>
      {activities.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : activities.isError ? (
        <p className="text-[13px] text-danger">Não deu para carregar a linha do tempo.</p>
      ) : activities.data.length === 0 ? (
        <p className="text-[13px] text-subtle">Mudanças de etapa e notas aparecem aqui.</p>
      ) : (
        <ol>
          {activities.data.map((a) => {
            const meta = activityMeta(a.type);
            const Icon = meta.icon;
            return (
              <TimelineItem
                key={a.id}
                icon={<Icon className="size-3.5" />}
                tone={meta.tone}
                title={a.type === "note" ? "Nota" : a.title}
                at={a.created_at}
                meta={a.user_id ? members.get(a.user_id)?.name : undefined}
              >
                {a.body}
              </TimelineItem>
            );
          })}
        </ol>
      )}
    </section>
  );
}
