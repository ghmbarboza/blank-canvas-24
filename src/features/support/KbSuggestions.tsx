import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Bot, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/functions";

import { supportKeys } from "./api";

interface Suggested {
  id: string;
  title: string;
  category: string | null;
  body_md: string;
  status: string;
  ai_suggested?: boolean | null;
}

// Rascunhos que a IA escreveu a partir de chamados resolvidos: o gestor revisa e aprova.
export function KbSuggestions<T extends Suggested>({
  accountId,
  articles,
  canApprove,
  onReview,
}: {
  accountId: string;
  articles: T[];
  canApprove: boolean;
  onReview: (a: T) => void;
}) {
  const qc = useQueryClient();
  const list = articles.filter((a) => a.ai_suggested && a.status === "draft");
  const act = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "publish" | "discard" }) => {
      const { error } =
        kind === "publish"
          ? await supabase
              .from("kb_articles")
              .update({ status: "published" })
              .eq("id", id)
              .eq("account_id", accountId)
          : await supabase.from("kb_articles").delete().eq("id", id).eq("account_id", accountId);
      if (error) throw error;
      return kind;
    },
    onSuccess: (kind) => {
      toast.success(
        kind === "publish" ? "Artigo publicado na central de ajuda" : "Sugestão descartada",
      );
      void qc.invalidateQueries({ queryKey: supportKeys.kb(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (list.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-primary-line bg-primary-soft/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <Bot className="size-4 text-primary" aria-hidden />
        {list.length} {list.length > 1 ? "artigos sugeridos" : "artigo sugerido"} pela IA a partir
        de chamados resolvidos
      </p>
      <ul className="grid gap-2 md:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className="rounded-xl border border-border bg-surface p-3">
            <p className="truncate text-[13px] font-medium">{a.title}</p>
            <p className="line-clamp-2 text-[12px] text-muted-foreground">
              {a.body_md.slice(0, 200)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => onReview(a)}>
                <Pencil /> Revisar
              </Button>
              {canApprove && (
                <>
                  <Button
                    size="sm"
                    onClick={() => act.mutate({ id: a.id, kind: "publish" })}
                    disabled={act.isPending}
                  >
                    {act.isPending && act.variables?.id === a.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Check />
                    )}
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Descartar sugestão"
                    onClick={() => act.mutate({ id: a.id, kind: "discard" })}
                    disabled={act.isPending}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
