import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { PublicShell } from "./PublicShell";

interface Info {
  company: string;
  question: string;
  answered: boolean;
  closed?: boolean;
  score: number | null;
}

const CSAT_FACES = ["Muito ruim", "Ruim", "Ok", "Bom", "Excelente"];

// Página pública de pesquisa (CSAT 1–5 ou NPS 0–10), respondida por link, sem login.
export function SurveyPage({ kind, token }: { kind: "csat" | "nps"; token: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const info = useQuery({
    queryKey: ["survey", kind, token],
    retry: false,
    queryFn: async (): Promise<Info> => {
      const res = await fetch(`/api/public/survey?kind=${kind}&token=${encodeURIComponent(token)}`);
      const j = (await res.json()) as Info & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Pesquisa não encontrada");
      return j;
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/public/survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, token, score, comment }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não deu para enviar");
    },
  });

  const scale = kind === "csat" ? [1, 2, 3, 4, 5] : Array.from({ length: 11 }, (_, i) => i);
  const done = send.isSuccess || info.data?.answered;

  return (
    <PublicShell company={info.data?.company}>
      <section className="rounded-[24px] border border-border bg-surface p-6">
        {info.isPending ? (
          <Loader2 className="mx-auto my-10 animate-spin text-subtle" />
        ) : info.isError ? (
          <p className="py-8 text-center text-[14px] text-muted-foreground">
            Este link não é mais válido.
          </p>
        ) : done ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-foreground" />
            <h1 className="mt-3 font-display text-[22px] font-medium">Obrigado!</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Sua resposta ajuda a melhorar o atendimento.
            </p>
          </div>
        ) : info.data?.closed ? (
          <p className="py-8 text-center text-[14px] text-muted-foreground">
            Esta pesquisa foi encerrada.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (score !== null) send.mutate();
            }}
          >
            <h1 className="font-display text-[20px] leading-snug font-medium">
              {info.data?.question}
            </h1>
            <div
              className={cn(
                "mt-6 grid gap-2",
                kind === "csat" ? "grid-cols-5" : "grid-cols-6 sm:grid-cols-11",
              )}
              role="radiogroup"
              aria-label="Nota"
            >
              {scale.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  onClick={() => setScore(n)}
                  className={cn(
                    "grid h-12 place-items-center rounded-2xl border text-[15px] font-semibold tabular-nums transition-colors",
                    score === n
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                  title={kind === "csat" ? CSAT_FACES[n - 1] : undefined}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 flex justify-between text-[11px] text-subtle">
              <span>{kind === "csat" ? "Muito ruim" : "Nada provável"}</span>
              <span>{kind === "csat" ? "Excelente" : "Muito provável"}</span>
            </p>
            <Textarea
              className="mt-5"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Quer contar mais? (opcional)"
            />
            {send.isError && (
              <p className="mt-2 text-[12px] text-danger">{(send.error as Error).message}</p>
            )}
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={score === null || send.isPending}
            >
              {send.isPending && <Loader2 className="animate-spin" />} Enviar resposta
            </Button>
          </form>
        )}
      </section>
    </PublicShell>
  );
}
