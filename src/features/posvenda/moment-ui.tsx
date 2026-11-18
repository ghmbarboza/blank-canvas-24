// Momento do cliente na tela: o selo, o bloco com os prazos (e a data da compra editável) e o
// registro manual de avaliações públicas. A conta é de moment.ts; aqui só se mostra.
import { useContext, useId, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineField } from "@/features/contacts/components/detail/InlineField";
import { BRAND } from "@/lib/brand";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  COMPLAINT_STATUS_LABEL,
  MOMENT_LABEL,
  PURCHASE_KEY,
  RENEWAL_KEY,
  REVIEW_KIND_LABEL,
  formatDay,
  isoDay,
  reviewLine,
  reviewsOf,
  todayIso,
  withComplaintStatus,
  withCustomDate,
  withReview,
  withoutReview,
  type ComplaintStatus,
  type MomentKey,
  type MomentResult,
  type ReviewKind,
} from "./moment";
import { MomentMapContext, useMomentMap, usePatchContactCustom } from "./moment-api";

// A cor nunca vem sozinha: o selo sempre traz o nome do momento.
const MOMENT_STYLE: Record<MomentKey, string> = {
  risco_cancelamento: "border-danger/30 bg-danger/10 text-danger",
  arrependimento: "border-warm-line bg-warm-soft text-warm-fg",
  renovacao: "border-transparent bg-gold-soft text-gold-text",
  recompra: "border-primary-line bg-primary-soft text-foreground",
  garantia: "border-border bg-surface-2 text-foreground",
  fora_garantia: "border-border bg-transparent text-muted-foreground",
  sem_data: "border-dashed border-border-strong bg-transparent text-muted-foreground",
};

export function MomentChip({
  momentKey,
  title,
  className,
}: {
  momentKey: MomentKey;
  /** Frase com o número que sustenta o selo (aparece ao passar o mouse). */
  title?: string | undefined;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[3px] text-[11px] leading-none font-medium whitespace-nowrap",
        MOMENT_STYLE[momentKey],
        className,
      )}
    >
      {MOMENT_LABEL[momentKey]}
    </span>
  );
}

/** Selo do momento de um contato, lido do mapa que a tela pai calculou. Sem mapa, não mostra nada. */
export function ContactMomentBadge({
  contactId,
  className,
}: {
  contactId: string | null | undefined;
  className?: string;
}) {
  const map = useContext(MomentMapContext);
  const m = contactId ? map?.get(contactId) : undefined;
  return m ? <MomentBadge moment={m} {...(className ? { className } : {})} /> : null;
}

/** Selo principal e, se couber, quantos outros momentos o cliente vive ao mesmo tempo. */
export function MomentBadge({ moment, className }: { moment: MomentResult; className?: string }) {
  const others = moment.secondary.filter((s) => s.key !== "fora_garantia" && s.key !== "sem_data");
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <MomentChip momentKey={moment.primary.key} title={moment.primary.detail} />
      {others.length > 0 && (
        <span
          className="text-[11px] text-subtle tabular-nums"
          title={others.map((o) => `${o.label}: ${o.detail}`).join(" · ")}
          aria-label={`Também: ${others.map((o) => o.label).join(", ")}`}
        >
          +{others.length}
        </span>
      )}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-2 py-1">
      <dt className="pt-1.5 text-[12px] text-subtle">{label}</dt>
      <dd className="min-w-0 px-2 py-1.5 text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Momento do cliente com os prazos e a data da compra editável ali mesmo. Para quem ainda não é
 * cliente não mostra nada: o bloco de saúde já diz isso com o próximo passo.
 */
export function MomentBlock({
  accountId,
  contactId,
  className,
}: {
  accountId: string;
  contactId: string;
  className?: string;
}) {
  const { map, isPending, isError } = useMomentMap(accountId);
  const patch = usePatchContactCustom(accountId);
  const headingId = useId();

  if (isPending) return <Skeleton className={cn("h-24 w-full rounded-xl", className)} />;
  if (isError)
    return (
      <p className={cn("text-[13px] text-danger", className)}>
        Não deu para carregar o momento do cliente.
      </p>
    );
  const m = map.get(contactId);
  if (!m) return null;

  async function saveDate(key: typeof PURCHASE_KEY | typeof RENEWAL_KEY, raw: string) {
    const day = raw ? isoDay(raw) : null;
    try {
      await patch.mutateAsync({ contactId, patch: (c) => withCustomDate(c, key, day) });
      toast.success(
        key === PURCHASE_KEY ? "Data da compra atualizada" : "Data de renovação atualizada",
      );
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  const today = todayIso();
  const informed = m.purchase.date !== null && !m.purchase.estimated;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h3
        id={headingId}
        className="mb-2 text-[11px] font-medium tracking-widest text-subtle uppercase"
      >
        Momento no pós-venda
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <MomentChip momentKey={m.primary.key} />
        {m.secondary.map((s) => (
          <MomentChip key={s.key} momentKey={s.key} title={s.detail} className="opacity-80" />
        ))}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{m.primary.detail}.</p>

      {m.riskReasons.length > 1 && (
        <ul className="mt-2 space-y-1" aria-label="Sinais de risco de cancelamento">
          {m.riskReasons.slice(1).map((r) => (
            <li key={r} className="text-[12px] leading-snug text-muted-foreground">
              {r}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-2 border-t border-border pt-2">
        <InlineField
          label="Compra"
          type="date"
          value={informed ? m.purchase.date : null}
          display={m.purchase.date ? formatDay(m.purchase.date) : undefined}
          validate={(v) =>
            v && !isoDay(v)
              ? "Data inválida"
              : v && v > today
                ? "A compra não pode ser no futuro"
                : null
          }
          onSave={(v) => saveDate(PURCHASE_KEY, v)}
        />
        {m.purchase.estimated && m.purchase.date && (
          <p className="mb-1 ml-[96px] px-2 text-[11px] leading-snug text-subtle">
            Sem data informada: contando de {formatDay(m.purchase.date)}, quando virou cliente.
            Informe a data certa acima.
          </p>
        )}
        {m.withdrawal && (
          <Row label="Arrependim.">
            {m.withdrawal.active
              ? `Dia ${m.withdrawal.day} de ${m.withdrawal.of}, vence em ${formatDay(m.withdrawal.endsOn)}`
              : `Prazo de ${m.withdrawal.of} dias venceu em ${formatDay(m.withdrawal.endsOn)}`}
          </Row>
        )}
        {m.warranty && (
          <Row label="Garantia">
            {m.warranty.active
              ? `Até ${formatDay(m.warranty.endsOn)} (${m.warranty.daysLeft === 0 ? "vence hoje" : `faltam ${m.warranty.daysLeft} dias`})`
              : `Venceu em ${formatDay(m.warranty.endsOn)}`}
          </Row>
        )}
        {m.rebuy && (
          <Row label="Recompra">
            {m.rebuy.due
              ? "Na hora de comprar de novo"
              : `Ciclo fecha em ${formatDay(m.rebuy.dueOn)}`}
          </Row>
        )}
        <InlineField
          label="Renovação"
          type="date"
          value={m.renewal?.date ?? null}
          display={
            m.renewal
              ? `${formatDay(m.renewal.date)} (${
                  m.renewal.inDays < 0
                    ? `venceu há ${-m.renewal.inDays} dias`
                    : m.renewal.inDays === 0
                      ? "hoje"
                      : `em ${m.renewal.inDays} dias`
                })`
              : undefined
          }
          validate={(v) => (v && !isoDay(v) ? "Data inválida" : null)}
          onSave={(v) => saveDate(RENEWAL_KEY, v)}
        />
      </dl>
    </section>
  );
}

const KINDS: ReviewKind[] = ["pedido", "google", "reclame_aqui"];
const STATUSES: ComplaintStatus[] = ["aberta", "respondida", "resolvida"];

/** Registro manual de avaliações públicas do cliente (Google e Reclame Aqui). */
export function ReviewsLog({
  accountId,
  contactId,
  custom,
}: {
  accountId: string;
  contactId: string;
  custom: unknown;
}) {
  const uid = useId();
  const patch = usePatchContactCustom(accountId);
  const entries = reviewsOf(custom);
  const [kind, setKind] = useState<ReviewKind>("pedido");
  const [day, setDay] = useState(todayIso());
  const [nota, setNota] = useState("5");
  const [status, setStatus] = useState<ComplaintStatus>("aberta");
  const today = todayIso();
  const dayOk = Boolean(isoDay(day)) && day <= today;

  function run(fn: (c: unknown) => Record<string, unknown>, ok: string) {
    patch.mutate(
      { contactId, patch: fn },
      { onSuccess: () => toast.success(ok), onError: (e) => toast.error(errorMessage(e)) },
    );
  }

  function add() {
    if (!dayOk) return;
    run(
      (c) =>
        withReview(c, {
          id: `${kind}-${Date.now().toString(36)}`,
          kind,
          at: day,
          ...(kind === "google" ? { nota: Number(nota) } : {}),
          ...(kind === "reclame_aqui" ? { status } : {}),
        }),
      "Registrado na ficha do cliente",
    );
  }

  return (
    <div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-[12px] text-muted-foreground">
          Nada registrado ainda. Quando pedir uma avaliação, ou quando o cliente avaliar ou
          reclamar, lance aqui para acompanhar.
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="Avaliações registradas">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-[13px]">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  e.kind === "reclame_aqui" && e.status === "aberta"
                    ? "bg-danger"
                    : e.kind === "google"
                      ? "bg-gold"
                      : "bg-border-strong",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 leading-snug">
                {e.kind === "reclame_aqui"
                  ? `Reclamou no Reclame Aqui em ${formatDay(e.at)}`
                  : reviewLine(e)}
                {e.via === "regra" && <span className="text-subtle"> (por regra)</span>}
              </span>
              {e.kind === "reclame_aqui" && (
                <Select
                  value={e.status ?? "aberta"}
                  onValueChange={(v) =>
                    run(
                      (c) => withComplaintStatus(c, e.id, v as ComplaintStatus),
                      "Situação da reclamação atualizada",
                    )
                  }
                  disabled={patch.isPending}
                >
                  <SelectTrigger
                    className="h-7 w-[118px] text-[12px]"
                    aria-label="Situação da reclamação"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {COMPLAINT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                type="button"
                onClick={() => run((c) => withoutReview(c, e.id), "Registro removido")}
                disabled={patch.isPending}
                className="rounded p-1 text-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Remover registro: ${reviewLine(e)}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 grid gap-2 border-t border-border pt-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          add();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 grid gap-1">
            <Label htmlFor={`${uid}-kind`} className="text-[12px] text-subtle">
              O que aconteceu
            </Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ReviewKind)}>
              <SelectTrigger id={`${uid}-kind`} className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {REVIEW_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${uid}-day`} className="text-[12px] text-subtle">
              Dia
            </Label>
            <Input
              id={`${uid}-day`}
              type="date"
              max={today}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-invalid={!dayOk}
              className="h-8 text-[13px]"
            />
          </div>
          {kind === "google" && (
            <div className="grid gap-1">
              <Label htmlFor={`${uid}-nota`} className="text-[12px] text-subtle">
                Nota (1 a 5)
              </Label>
              <Select value={nota} onValueChange={setNota}>
                <SelectTrigger id={`${uid}-nota`} className="h-8 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "4", "3", "2", "1"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "reclame_aqui" && (
            <div className="grid gap-1">
              <Label htmlFor={`${uid}-status`} className="text-[12px] text-subtle">
                Situação
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ComplaintStatus)}>
                <SelectTrigger id={`${uid}-status`} className="h-8 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {COMPLAINT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!dayOk || patch.isPending}
          className="justify-self-start"
        >
          {patch.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Registrar
        </Button>
        <p className="text-[11px] leading-snug text-subtle">
          O registro é manual: a {BRAND.name} não lê o Google nem o Reclame Aqui sozinha.
        </p>
      </form>
    </div>
  );
}
