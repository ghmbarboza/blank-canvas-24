// Passo do assistente de configuração: equipe com habilidades e pelo menos uma fila ativa.
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";

import { useSelfTest } from "./api";
import { QueuesPanel } from "./QueuesPanel";
import { TeamPanel } from "./TeamPanel";

export function CallCenterSetupStep({
  accountId,
  onDone,
}: {
  accountId: string;
  onDone: () => void;
}) {
  const t = useSelfTest(accountId);
  const test = () =>
    void t.refetch().then((r) => {
      if (r.error) toast.error(errorMessage(r.error));
      else if (r.data?.ok) toast.success("Tudo certo: cada fila tem quem atenda");
      else toast.error("Ainda falta: veja o que está em vermelho");
    });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-display text-[18px] font-medium">Monte a equipe de atendimento</h3>
        <p className="text-[13px] text-muted-foreground">
          Ligue “Atende na fila” para quem atende e diga o que cada pessoa sabe fazer (ex.: suporte,
          cobrança, renovação). A fila manda cada atendimento para quem tem a habilidade e está
          livre.
        </p>
      </div>
      <TeamPanel accountId={accountId} />
      <div className="space-y-1">
        <h3 className="font-display text-[18px] font-medium">Crie pelo menos uma fila</h3>
        <p className="text-[13px] text-muted-foreground">
          Uma fila para cada tipo de atendimento, com os canais que entram nela e a habilidade
          exigida.
        </p>
      </div>
      <QueuesPanel accountId={accountId} />
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="rounded-full" onClick={test} disabled={t.isFetching}>
            {t.isFetching && <Loader2 className="size-4 animate-spin" />}
            Testar
          </Button>
          <Button className="rounded-full" disabled={!t.data?.ok} onClick={onDone}>
            Concluir este passo
          </Button>
        </div>
        {t.data && (
          <ul className="mt-3 space-y-1 text-[13px]">
            <Check
              ok={t.data.team > 0}
              text={`${t.data.team} pessoa(s) na equipe de atendimento`}
            />
            <Check
              ok={t.data.team_with_skills > 0}
              text={`${t.data.team_with_skills} com pelo menos uma habilidade`}
            />
            {t.data.queues.length === 0 ? (
              <Check ok={false} text="Nenhuma fila ativa" />
            ) : (
              t.data.queues.map((q) => (
                <Check
                  key={q.id}
                  ok={q.eligible > 0}
                  text={`Fila ${q.name}: ${q.eligible} pessoa(s) ${q.skill ? `com "${q.skill}"` : "podem atender"}${q.eligible ? `, ${q.available_now} disponível(is) agora` : ". Dê essa habilidade a alguém."}`}
                />
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-1.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-label="ok" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="falta" />
      )}
      {text}
    </li>
  );
}
