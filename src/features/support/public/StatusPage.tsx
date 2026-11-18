import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";

import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PublicShell } from "./PublicShell";

const STATUS: Record<string, string> = {
  investigating: "Investigando",
  identified: "Causa encontrada",
  monitoring: "Corrigido, em observação",
  resolved: "Resolvido",
};

interface StatusIncident {
  id: string;
  title: string;
  status: string;
  impact: string;
  public_summary: string | null;
  started_at: string;
  resolved_at: string | null;
  updates: { status: string; body: string; created_at: string }[];
}

// Página de status pública: o que está fora do ar agora e o histórico recente.
export function StatusPage({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["status-page", slug],
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/public/status?slug=${encodeURIComponent(slug)}`);
      const j = (await res.json()) as {
        company?: string;
        incidents?: StatusIncident[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Página não encontrada");
      return j;
    },
  });
  const active = (q.data?.incidents ?? []).filter((i) => i.status !== "resolved");
  const past = (q.data?.incidents ?? []).filter((i) => i.status === "resolved");

  return (
    <PublicShell company={q.data?.company} wide>
      <div className="rounded-[24px] border border-border bg-surface p-6 sm:p-8">
        {q.isPending ? (
          <p className="flex items-center gap-2 text-[14px]">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : q.isError ? (
          <p className="text-[14px]">{q.error.message}</p>
        ) : (
          <>
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl px-5 py-4",
                active.length ? "bg-primary text-primary-foreground" : "bg-surface-2",
              )}
            >
              {active.length ? (
                <span className="relative flex size-3" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
                  <span className="relative inline-flex size-3 rounded-full bg-white" />
                </span>
              ) : (
                <CheckCircle2 className="size-5 text-foreground" aria-hidden />
              )}
              <p className="font-display text-[18px] font-semibold">
                {active.length
                  ? `${active.length} ${active.length > 1 ? "problemas" : "problema"} em andamento`
                  : "Tudo funcionando normalmente"}
              </p>
            </div>
            {[...active, ...past].map((i) => (
              <section key={i.id} className="mt-6 border-t border-border pt-5">
                <h2 className="text-[15px] font-medium">{i.title}</h2>
                <p className="text-[12px] text-muted-foreground">
                  {STATUS[i.status]} · começou {formatDateTime(i.started_at)}
                  {i.resolved_at && ` · resolvido ${formatRelative(i.resolved_at)}`}
                </p>
                <ol className="mt-3 grid gap-3">
                  {i.updates.map((u, k) => (
                    <li key={k} className="border-l-2 border-primary-line pl-3">
                      <p className="text-[11px] text-subtle">
                        {STATUS[u.status]} · {formatDateTime(u.created_at)}
                      </p>
                      <p className="text-[14px] whitespace-pre-wrap">{u.body}</p>
                    </li>
                  ))}
                  {i.updates.length === 0 && i.public_summary && (
                    <li className="text-[14px]">{i.public_summary}</li>
                  )}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </PublicShell>
  );
}
