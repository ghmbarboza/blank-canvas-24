import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Info, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSegments } from "@/features/segments/api";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useAudienceCount, useSaveCampaign, useTemplates } from "./api";

const BLANK = "__blank__";

// Variável da frase: um seletor que parece texto sublinhado, não um campo de formulário.
const VARIABLE =
  "mx-1 inline-flex h-auto w-auto max-w-full gap-1 rounded-lg border-0 border-b border-dashed border-foreground/30 bg-primary-soft px-2.5 py-0.5 align-baseline font-display text-[22px] leading-snug font-semibold text-foreground shadow-none transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px hover:border-foreground sm:text-[28px] [&>span]:truncate [&>svg]:size-4 [&>svg]:opacity-60";

// "Quero enviar para [segmento] o e-mail [modelo]": monta o rascunho e leva para o editor.
export function CampaignQuickStart({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const segments = useSegments(accountId);
  const templates = useTemplates(accountId);
  const create = useSaveCampaign(accountId);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>(BLANK);
  const audience = useAudienceCount(accountId, segmentId);
  const segList = segments.data ?? [];
  const tplList = templates.data ?? [];

  async function start() {
    const segment = segList.find((s) => s.id === segmentId);
    const tpl = tplList.find((t) => t.id === templateId);
    try {
      const c = await create.mutateAsync({
        values: {
          name: tpl?.name ?? (segment ? `E-mail para ${segment.name}` : "Nova campanha"),
          segment_id: segmentId,
          ...(tpl
            ? {
                template_id: tpl.id,
                subject: tpl.subject,
                preheader: tpl.preheader,
                blocks: tpl.blocks,
              }
            : {}),
        },
      });
      void navigate({ to: "/campanhas/$campaignId/editar", params: { campaignId: c.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <section
      aria-labelledby="quick-start-title"
      className="atmosphere relative overflow-hidden rounded-[24px] border border-border bg-surface p-5 sm:p-8"
    >
      <h2 id="quick-start-title" className="eyebrow mb-5 flex items-center gap-2 text-subtle">
        <Plus className="size-3.5 text-foreground" aria-hidden /> Criar nova campanha
      </h2>
      <p className="font-display text-[22px] leading-[1.7] font-semibold text-muted-foreground sm:text-[28px]">
        Quero enviar para
        <Select value={segmentId ?? ""} onValueChange={setSegmentId}>
          <SelectTrigger className={VARIABLE} aria-label="Público da campanha">
            <SelectValue placeholder={segList.length ? "escolher o público" : "um segmento"} />
          </SelectTrigger>
          <SelectContent>
            {segList.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
            {segList.length === 0 && (
              <p className="px-3 py-2 text-[13px] text-muted-foreground">
                Nenhum segmento criado ainda.
              </p>
            )}
          </SelectContent>
        </Select>
        o e-mail
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className={VARIABLE} aria-label="Conteúdo do e-mail">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BLANK}>em branco</SelectItem>
            {tplList.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        .
      </p>
      <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
          <AudienceHint
            hasSegments={segList.length > 0}
            segmentId={segmentId}
            pending={audience.isFetching}
            count={audience.data}
            failed={audience.isError}
          />
        </p>
        <Button
          className="shrink-0"
          disabled={!segmentId || create.isPending}
          onClick={() => void start()}
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : null}
          Continuar para o conteúdo <ArrowRight />
        </Button>
      </div>
    </section>
  );
}

function AudienceHint({
  hasSegments,
  segmentId,
  pending,
  count,
  failed,
}: {
  hasSegments: boolean;
  segmentId: string | null;
  pending: boolean;
  count: number | undefined;
  failed: boolean;
}) {
  if (!hasSegments)
    return (
      <span>
        Primeiro crie um segmento em{" "}
        <Link to="/contatos" className="font-medium text-foreground underline underline-offset-2">
          Contatos
        </Link>
        . É ele que define quem recebe.
      </span>
    );
  if (!segmentId) return <span>Escolha o público para ver quantos contatos recebem.</span>;
  if (pending) return <span>Contando os contatos com e-mail…</span>;
  if (failed || count === undefined)
    return <span>Você confere o número exato de contatos na revisão, antes de disparar.</span>;
  return (
    <span>
      Cerca de{" "}
      <strong className="font-semibold text-foreground tabular-nums">{formatNumber(count)}</strong>{" "}
      {count === 1 ? "contato com e-mail será alcançado" : "contatos com e-mail serão alcançados"}.
      Quem descadastrou fica de fora.
    </span>
  );
}
