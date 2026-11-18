import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  Layers,
  Loader2,
  Rocket,
  Save,
  Users,
} from "lucide-react";
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
import { useSegments } from "@/features/segments/api";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useAudienceCount,
  useCampaign,
  useCampaignAction,
  useSaveCampaign,
  useTemplates,
} from "./api";
import { BlockEditor } from "./BlockEditor";
import { ComposeWithAi } from "./ComposeWithAi";
import { blocksToHtml, isEmailBlocks, type EmailBlock } from "./render";

const STEPS = ["Público", "Conteúdo", "Teste", "Disparo"] as const;

// Nova campanha em quatro passos: público → conteúdo → teste (obrigatório) → disparar ou agendar.
export function CampaignEditor({ campaignId }: { campaignId: string }) {
  const { current } = useAccount();
  const { user } = useAuth();
  const accountId = current!.accountId;
  const navigate = useNavigate();
  const q = useCampaign(accountId, campaignId);
  const save = useSaveCampaign(accountId);
  const action = useCampaignAction(accountId, campaignId);
  const segments = useSegments(accountId);
  const templates = useTemplates(accountId);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [testTo, setTestTo] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const audience = useAudienceCount(accountId, segmentId);

  useEffect(() => {
    const c = q.data?.campaign;
    if (!c || loaded) return;
    setName(c.name);
    setSubject(c.subject);
    setPreheader(c.preheader ?? "");
    setSegmentId(c.segment_id);
    setBlocks(isEmailBlocks(c.blocks) ? c.blocks : []);
    setTestTo(c.test_sent_to ?? user?.email ?? "");
    setLoaded(true);
  }, [q.data, loaded, user?.email]);

  if (q.isPending) return <Skeleton className="m-6 h-96 rounded-[24px]" />;
  const c = q.data?.campaign;
  if (!c) return <p className="p-6 text-[13px] text-muted-foreground">Campanha não encontrada.</p>;
  if (c.status !== "draft" && c.status !== "paused") {
    void navigate({ to: "/campanhas/$campaignId", params: { campaignId }, replace: true });
    return null;
  }

  async function persist(silent = true) {
    const html = blocksToHtml(blocks, {
      preheader,
      brand: { name: current!.accountName },
      marketing: true,
    });
    try {
      await save.mutateAsync({
        id: campaignId,
        values: {
          name: name.trim() || "Campanha sem nome",
          subject,
          preheader: preheader || null,
          segment_id: segmentId,
          blocks: blocks as never,
          html,
        },
      });
      if (!silent) toast.success("Rascunho salvo");
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  }

  async function go(to: number) {
    if (to > step) {
      if (step === 0 && !segmentId) {
        toast.error("Escolha o público");
        return;
      }
      if (step === 1 && (!subject.trim() || blocks.length === 0)) {
        toast.error("Preencha o assunto e ao menos um bloco");
        return;
      }
    }
    if (await persist()) setStep(to);
  }

  async function sendTest() {
    if (!(await persist())) return;
    action.mutate(
      { action: "campaign_test", to: testTo },
      {
        onSuccess: (r) => toast.success(`Teste enviado para ${r.to}. Confira a caixa de entrada.`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  async function launch() {
    if (!(await persist())) return;
    const iso = when === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null;
    action.mutate(
      { action: "campaign_start", scheduledAt: iso },
      {
        onSuccess: (r) => {
          toast.success(
            r.status === "scheduled"
              ? "Campanha agendada"
              : `Disparo iniciado para ~${formatNumber(r.audience ?? 0)} pessoas`,
          );
          void navigate({ to: "/campanhas/$campaignId", params: { campaignId } });
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="atmosphere flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Link
          to="/campanhas"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Campanhas
        </Link>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 max-w-xs font-semibold"
          aria-label="Nome da campanha"
        />
        <ol className="ml-auto flex items-center gap-1" aria-label="Passos">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => void go(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "text-foreground"
                      : "text-subtle",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[10px]",
                    i === step ? "bg-white/20" : "bg-surface-2",
                  )}
                >
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void persist(false)}
          disabled={save.isPending}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {step === 0 && (
          <section className="mx-auto max-w-2xl space-y-4">
            <h2 className="font-display text-[20px] font-medium">Para quem vai?</h2>
            <p className="text-[13px] text-muted-foreground">
              Escolha um segmento de contatos. Quem descadastrou, revogou o consentimento, não tem
              e-mail ou já recebeu marketing hoje fica de fora sozinho.
            </p>
            <Select value={segmentId ?? ""} onValueChange={(v) => setSegmentId(v)}>
              <SelectTrigger aria-label="Segmento">
                <SelectValue placeholder="Escolha um segmento" />
              </SelectTrigger>
              <SelectContent>
                {(segments.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(segments.data ?? []).length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
                Ainda não há segmentos. Crie um em{" "}
                <Link to="/contatos" className="font-medium underline">
                  Contatos › Segmentos
                </Link>{" "}
                e volte aqui.
              </p>
            )}
            {segmentId && (
              <div className="flex items-center justify-between rounded-[24px] bg-[#001F35] px-5 py-4 text-white">
                <span className="inline-flex items-center gap-2 text-[13px] text-white/70">
                  <Users className="size-4" /> Contatos com e-mail no segmento
                </span>
                <span className="font-display text-[26px] font-semibold tabular-nums">
                  {audience.isFetching ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    formatNumber(audience.data ?? 0)
                  )}
                </span>
              </div>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="grid gap-1.5">
                <Label htmlFor="cp-subject">Assunto</Label>
                <Input
                  id="cp-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="{{primeiro_nome | Olá}}, temos uma novidade"
                  maxLength={200}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cp-pre">Texto de prévia (aparece ao lado do assunto)</Label>
                <Input
                  id="cp-pre"
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Começar de um modelo</Label>
                <Select
                  onValueChange={(id) => {
                    const t = (templates.data ?? []).find((x) => x.id === id);
                    if (t) {
                      setBlocks(isEmailBlocks(t.blocks) ? t.blocks : []);
                      if (!subject) setSubject(t.subject);
                      if (!preheader) setPreheader(t.preheader ?? "");
                    }
                  }}
                >
                  <SelectTrigger className="w-52" aria-label="Modelo">
                    <SelectValue
                      placeholder={
                        (templates.data ?? []).length ? "Escolher modelo" : "Sem modelos"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground">
                Monte com blocos ou peça um rascunho para a IA.
              </p>
              <ComposeWithAi
                accountId={accountId}
                hasContent={blocks.length > 0}
                onDone={(r) => {
                  setSubject(r.subject);
                  setPreheader(r.preheader);
                  setBlocks(r.blocks);
                }}
              />
            </div>
            <BlockEditor
              accountId={accountId}
              blocks={blocks}
              onChange={setBlocks}
              preheader={preheader}
              brand={current!.accountName}
              marketing
            />
          </section>
        )}

        {step === 2 && (
          <section className="mx-auto max-w-xl space-y-4">
            <h2 className="font-display text-[20px] font-medium">Mande um teste para você</h2>
            <p className="text-[13px] text-muted-foreground">
              O disparo só libera depois de um teste. Ele vai com dados de exemplo e nunca para a
              base.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                aria-label="E-mail do teste"
              />
              <Button onClick={() => void sendTest()} disabled={action.isPending}>
                {action.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Enviar
                teste
              </Button>
            </div>
            {c.tested_at && (
              <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-[13px]">
                <CheckCircle2 className="size-4 text-foreground" /> Teste enviado para{" "}
                {c.test_sent_to} em {formatDateTime(c.tested_at)}.
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="mx-auto max-w-xl space-y-5">
            <h2 className="font-display text-[20px] font-medium">Tudo pronto?</h2>
            <dl className="divide-y divide-border rounded-[24px] border border-border bg-surface text-[13px]">
              <Row
                label="Público"
                value={(segments.data ?? []).find((s) => s.id === segmentId)?.name ?? "—"}
                icon={Layers}
              />
              <Row
                label="Contatos com e-mail"
                value={formatNumber(audience.data ?? 0)}
                icon={Users}
              />
              <Row label="Assunto" value={subject || "—"} />
              <Row
                label="Teste"
                value={c.tested_at ? `Enviado para ${c.test_sent_to}` : "Falta enviar"}
              />
            </dl>
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[12px] text-muted-foreground">
              Domínio novo sobe por degraus (200, 500, 1.000, 2.000, 4.000, 8.000 por dia) para não
              cair no spam. O que passar do teto do dia continua sozinho no dia seguinte.
            </p>
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />{" "}
                Enviar agora
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="radio" checked={when === "later"} onChange={() => setWhen("later")} />{" "}
                Agendar
              </label>
              {when === "later" && (
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-64"
                  aria-label="Data e hora"
                />
              )}
            </div>
            <Button
              size="lg"
              onClick={() => void launch()}
              disabled={action.isPending || !c.tested_at || (when === "later" && !scheduledAt)}
            >
              {action.isPending ? <Loader2 className="animate-spin" /> : <Rocket />}{" "}
              {when === "later" ? "Agendar campanha" : "Disparar campanha"}
            </Button>
            {!c.tested_at && (
              <p className="text-[12px] text-danger">
                Envie o teste no passo anterior para liberar o disparo.
              </p>
            )}
          </section>
        )}
      </div>

      <footer className="flex justify-between border-t border-border px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          onClick={() => void go(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft /> Voltar
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => void go(step + 1)}>
            Continuar <ArrowRight />
          </Button>
        )}
      </footer>
    </div>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Users }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="inline-flex items-center gap-2 text-subtle">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
