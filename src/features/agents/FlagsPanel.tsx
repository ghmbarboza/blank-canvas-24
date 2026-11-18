import { Link } from "@tanstack/react-router";
import { Check, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useResolveFlag, type SupervisorFlag } from "./api";

const LABEL: Record<string, string> = {
  stuck: "Travada",
  angry: "Cliente irritado",
  bad_promise: "Promessa indevida",
  silent_no_owner: "IA calada sem dono",
};

// Alertas do supervisor: cada um leva à conversa e some quando resolvido.
export function FlagsPanel({
  accountId,
  flags,
}: {
  accountId: string;
  flags: (SupervisorFlag & { conversations: { title: string | null } | null })[];
}) {
  const resolve = useResolveFlag(accountId);
  return (
    <section
      aria-labelledby="flags-title"
      className="mb-5 rounded-xl border border-border bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ShieldAlert className="size-4 text-primary" aria-hidden />
        <h2 id="flags-title" className="text-[14px] font-medium">
          O supervisor pede sua atenção em {flags.length} conversa{flags.length > 1 ? "s" : ""}
        </h2>
      </header>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {flags.map((f) => (
          <li key={f.id} className="row-wash flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">
              {LABEL[f.kind] ?? f.kind}
            </span>
            <Link
              to="/inbox/$conversationId"
              params={{ conversationId: f.conversation_id }}
              className="min-w-0 flex-1 truncate text-[13px] hover:underline"
            >
              <span className="font-medium">{f.conversations?.title ?? "Conversa"}</span>
              <span className="text-muted-foreground"> · {f.detail}</span>
            </Link>
            <span className="text-[11px] text-subtle">{formatRelative(f.created_at)}</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Marcar como resolvido"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate(f.id, { onError: (e) => toast.error(errorMessage(e)) })}
            >
              <Check /> Resolvido
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
