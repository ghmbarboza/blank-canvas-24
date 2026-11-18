import { useEffect, useId, useState } from "react";
import { CalendarClock, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useSaveAvaliacoes, useSavePrazos, type RuleRow } from "./api";
import { PRAZO_LIMITS, cleanUrl, type AvaliacoesConfig, type Prazos } from "./moment";
import type { RuleKey } from "./rules";

const FIELDS: { key: keyof Prazos; label: string; help: string }[] = [
  {
    key: "arrependimento_dias",
    label: "Prazo de arrependimento",
    help: "Dias em que o cliente ainda pode desistir. O padrão é 7 dias, para compras feitas fora da loja física.",
  },
  {
    key: "garantia_dias",
    label: "Garantia",
    help: "Dias de garantia que a sua empresa dá, contados da data da compra.",
  },
  {
    key: "renovacao_aviso_dias",
    label: "Aviso de renovação",
    help: "Com quantos dias de antecedência a renovação de um contrato vira alerta.",
  },
];

type Rows = Partial<Record<RuleKey, RuleRow>>;

// Prazos do pós-venda: de onde sai o momento de cada cliente (arrependimento, garantia, renovação).
export function PrazosBlock({
  accountId,
  prazos,
  rows,
  canEdit,
}: {
  accountId: string;
  prazos: Prazos;
  rows: Rows;
  canEdit: boolean;
}) {
  const uid = useId();
  const save = useSavePrazos(accountId);
  const asText = (p: Prazos) => ({
    arrependimento_dias: String(p.arrependimento_dias),
    garantia_dias: String(p.garantia_dias),
    renovacao_aviso_dias: String(p.renovacao_aviso_dias),
  });
  const [draft, setDraft] = useState(asText(prazos));
  const savedKey = `${prazos.arrependimento_dias}|${prazos.garantia_dias}|${prazos.renovacao_aviso_dias}`;
  useEffect(() => {
    setDraft(asText(prazos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const valid = (k: keyof Prazos) => {
    const n = Number(draft[k]);
    return (
      draft[k] !== "" && Number.isInteger(n) && n >= PRAZO_LIMITS[k].min && n <= PRAZO_LIMITS[k].max
    );
  };
  const allValid = FIELDS.every((f) => valid(f.key));
  const dirty = FIELDS.some((f) => draft[f.key] !== String(prazos[f.key]));

  function submit() {
    if (!allValid || !dirty) return;
    save.mutate(
      {
        prazos: {
          arrependimento_dias: Number(draft.arrependimento_dias),
          garantia_dias: Number(draft.garantia_dias),
          renovacao_aviso_dias: Number(draft.renovacao_aviso_dias),
        },
        rows,
      },
      {
        onSuccess: () =>
          toast.success("Prazos salvos. O momento de cada cliente já foi recalculado."),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="rounded-[24px] border border-border bg-surface p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2">
          <CalendarClock className="size-[18px] text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="text-[15px] font-semibold text-foreground">
            Prazos do pós-venda
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Contados da data da compra de cada cliente. É daqui que sai o momento que aparece na
            ficha, na lista de clientes e no Painel, e o que o atendente de IA sabe sobre troca e
            garantia.
          </p>
        </div>
      </header>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {FIELDS.map((f) => {
          const ok = valid(f.key);
          const lim = PRAZO_LIMITS[f.key];
          return (
            <div key={f.key} className="grid content-start gap-1.5">
              <Label htmlFor={`${uid}-${f.key}`}>{f.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${uid}-${f.key}`}
                  inputMode="numeric"
                  value={draft[f.key]}
                  disabled={!canEdit || save.isPending}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [f.key]: e.target.value.replace(/\D/g, "").slice(0, 4),
                    }))
                  }
                  aria-invalid={!ok}
                  aria-describedby={`${uid}-${f.key}-help`}
                  className="h-9 w-24 tabular-nums"
                />
                <span className="text-[13px] text-muted-foreground">dias</span>
              </div>
              <p
                id={`${uid}-${f.key}-help`}
                className={cn("text-[12px] leading-snug", ok ? "text-subtle" : "text-danger")}
              >
                {ok ? f.help : `De ${lim.min} a ${lim.max} dias.`}
              </p>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          {canEdit && (
            <Button type="submit" size="sm" disabled={!dirty || !allValid || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Salvar prazos
            </Button>
          )}
          {dirty && canEdit && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(asText(prazos))}
            >
              Desfazer
            </Button>
          )}
          <p className="text-[12px] text-subtle">
            São prazos da sua empresa. Confirme a regra que vale para o seu tipo de venda antes de
            mudar.
          </p>
        </div>
      </form>
    </section>
  );
}

// Avaliações públicas: os links da empresa, usados nas mensagens que pedem avaliação.
export function AvaliacoesBlock({
  accountId,
  links,
  rows,
  canEdit,
}: {
  accountId: string;
  links: AvaliacoesConfig;
  rows: Rows;
  canEdit: boolean;
}) {
  const uid = useId();
  const save = useSaveAvaliacoes(accountId);
  const [google, setGoogle] = useState(links.google_url);
  const [ra, setRa] = useState(links.reclame_aqui_url);
  useEffect(() => {
    setGoogle(links.google_url);
    setRa(links.reclame_aqui_url);
  }, [links.google_url, links.reclame_aqui_url]);

  const okUrl = (v: string) => v.trim() === "" || cleanUrl(v) !== "";
  const valid = okUrl(google) && okUrl(ra);
  const dirty = google.trim() !== links.google_url || ra.trim() !== links.reclame_aqui_url;

  function submit() {
    if (!valid || !dirty) return;
    save.mutate(
      { links: { google_url: google, reclame_aqui_url: ra }, rows },
      {
        onSuccess: () => toast.success("Links de avaliação salvos"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="rounded-[24px] border border-border bg-surface p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2">
          <Star className="size-[18px] text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="text-[15px] font-semibold text-foreground">
            Avaliações no Google e Reclame Aqui
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            O link do Google entra na mensagem da regra &quot;Nota alta pede indicação&quot;
            (variável {"{{link_avaliacao}}"}). O que cada cliente avaliou ou reclamou você registra
            na ficha dele.
          </p>
        </div>
      </header>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${uid}-google`}>Link para avaliar no Google</Label>
          <Input
            id={`${uid}-google`}
            type="url"
            inputMode="url"
            placeholder="https://g.page/r/sua-empresa/review"
            value={google}
            disabled={!canEdit || save.isPending}
            onChange={(e) => setGoogle(e.target.value)}
            aria-invalid={!okUrl(google)}
            aria-describedby={`${uid}-google-help`}
          />
          <p
            id={`${uid}-google-help`}
            className={cn("text-[12px]", okUrl(google) ? "text-subtle" : "text-danger")}
          >
            {okUrl(google)
              ? "No Perfil da Empresa no Google: Pedir avaliações, copiar o link."
              : "Cole o endereço completo, começando com https://"}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${uid}-ra`}>Perfil da empresa no Reclame Aqui</Label>
          <Input
            id={`${uid}-ra`}
            type="url"
            inputMode="url"
            placeholder="https://www.reclameaqui.com.br/empresa/sua-empresa"
            value={ra}
            disabled={!canEdit || save.isPending}
            onChange={(e) => setRa(e.target.value)}
            aria-invalid={!okUrl(ra)}
            aria-describedby={`${uid}-ra-help`}
          />
          <p
            id={`${uid}-ra-help`}
            className={cn("text-[12px]", okUrl(ra) ? "text-subtle" : "text-danger")}
          >
            {okUrl(ra)
              ? "Fica à mão para a equipe abrir e responder."
              : "Cole o endereço completo, começando com https://"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {canEdit && (
            <Button type="submit" size="sm" disabled={!dirty || !valid || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Salvar links
            </Button>
          )}
          {links.reclame_aqui_url && (
            <a
              href={links.reclame_aqui_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Abrir o Reclame Aqui
            </a>
          )}
          <p className="text-[12px] text-subtle">
            O registro é manual: a {BRAND.name} não lê o Google nem o Reclame Aqui sozinha.
          </p>
        </div>
      </form>
    </section>
  );
}
