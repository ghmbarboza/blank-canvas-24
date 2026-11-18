import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileX,
  Landmark,
  Loader2,
  Printer,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isValidCnpj } from "@/features/companies/cnpj";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { formatDocument, isValidCpf, type ProposalItem } from "../totals";
import { beaconView, proposalAction, type PublicProposal } from "./api";

const BILLING: Record<ProposalItem["billing"], string> = {
  one_time: "Pagamento único",
  monthly: "Por mês",
  yearly: "Por ano",
};

function dateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Página pública da proposta: o cliente lê, aceita com nome e CPF/CNPJ e, se houver Asaas, paga.
export function ProposalPublicPage({ token, print = false }: { token: string; print?: boolean }) {
  const qc = useQueryClient();
  const key = ["public-proposal", token];
  const q = useQuery({ queryKey: key, queryFn: () => proposalAction(token, "get"), retry: false });
  const started = useRef(Date.now());

  useEffect(() => {
    if (print) return;
    beaconView(token, 0, "view");
    const onHide = () => {
      if (document.visibilityState === "hidden")
        beaconView(token, (Date.now() - started.current) / 1000, "read");
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [token, print]);

  useEffect(() => {
    if (!print || !q.data) return undefined;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [print, q.data]);

  if (q.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-subtle" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div>
          <FileX className="mx-auto size-8 text-subtle" />
          <h1 className="mt-3 font-display text-xl font-medium">Proposta não encontrada</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Confira o link recebido ou peça um novo para quem te enviou.
          </p>
        </div>
      </div>
    );
  }

  const { seller, client, proposal: p } = q.data;
  const set = (d: PublicProposal) => qc.setQueryData(key, d);

  return (
    <div
      className={cn("min-h-dvh bg-background text-foreground", print && "print-proposal bg-white")}
    >
      <style>{`@media print { @page { margin: 14mm; } .no-print { display: none !important; } .print-proposal { background: #fff !important; } .print-break { break-inside: avoid; } }`}</style>
      <header
        className={cn(
          "relative overflow-hidden bg-[#0A1F3B] text-white",
          print ? "px-8 py-8" : "px-5 pt-10 pb-24 sm:px-10",
        )}
      >
        {!print && (
          <div
            className="hero-orb pointer-events-none absolute -top-32 -right-20 size-96 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
        )}
        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {seller.logo_url ? (
                <img
                  src={seller.logo_url}
                  alt={seller.name}
                  className="h-9 w-auto rounded-md bg-white/10 p-1"
                />
              ) : (
                <span className="grid size-10 place-items-center rounded-xl bg-white/10 font-display text-[15px] font-semibold">
                  {seller.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="text-[14px] font-medium text-white/80">{seller.name}</span>
            </div>
            {!print && (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="no-print text-white/80 hover:bg-white/10 hover:text-white"
              >
                <a href={`/proposta/${token}/imprimir`} target="_blank" rel="noopener noreferrer">
                  <Printer /> Baixar PDF
                </a>
              </Button>
            )}
          </div>
          <p className="mt-10 text-[12px] font-medium tracking-[0.18em] text-white/60 uppercase">
            Proposta nº {p.number}
            {p.version > 1 && ` · versão ${p.version}`}
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-[30px] leading-tight font-medium sm:text-[40px]">
            {p.title}
          </h1>
          <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
            {client.name && (
              <div>
                <p className="text-[11px] tracking-[0.14em] text-white/50 uppercase">Para</p>
                <p className="text-[15px] font-medium">{client.name}</p>
                {client.cnpj && (
                  <p className="text-[12px] text-white/60">CNPJ {formatDocument(client.cnpj)}</p>
                )}
              </div>
            )}
            <div>
              <p className="text-[11px] tracking-[0.14em] text-white/50 uppercase">Válida até</p>
              <p className="inline-flex items-center gap-1.5 text-[15px] font-medium">
                <CalendarClock className="size-4 text-white/60" /> {dateBr(p.valid_until)}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[11px] tracking-[0.14em] text-white/50 uppercase">
                Investimento no 1º ano
              </p>
              <p className="font-display text-[34px] leading-none font-semibold tabular-nums">
                {formatMoney(p.total)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "relative mx-auto grid max-w-5xl gap-6 px-5 sm:px-10",
          print ? "mt-6" : "-mt-14 pb-16 lg:grid-cols-[minmax(0,1fr)_340px]",
        )}
      >
        <div className="space-y-6">
          <section
            className="print-break rounded-[24px] border border-border bg-surface p-5 sm:p-7"
            aria-labelledby="pp-items"
          >
            <h2 id="pp-items" className="eyebrow mb-4">
              O que está incluído
            </h2>
            <ul className="divide-y divide-border">
              {p.items.map((i, idx) => (
                <li key={idx} className="flex items-start gap-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{i.name}</p>
                    <p className="text-[12px] text-subtle tabular-nums">
                      {Number(i.quantity) !== 1 && `${Number(i.quantity)} × `}
                      {formatMoney(i.unit_price)} · {BILLING[i.billing]}
                      {Number(i.discount_pct) > 0 && (
                        <span className="text-foreground">
                          {" "}
                          · {Number(i.discount_pct)}% de desconto
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums">
                    {formatMoney(i.line_period)}
                    {i.billing === "monthly" && (
                      <span className="block text-[11px] font-normal text-subtle">/ mês</span>
                    )}
                    {i.billing === "yearly" && (
                      <span className="block text-[11px] font-normal text-subtle">/ ano</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 rounded-2xl bg-surface-2/60 p-4 text-[14px]">
              {p.one_time_total > 0 && (
                <Total label="Pagamento único" value={formatMoney(p.one_time_total)} />
              )}
              {p.monthly_total > 0 && (
                <Total
                  label="Mensalidade"
                  value={`${formatMoney(p.monthly_total)} / mês`}
                  hint={`${formatMoney(p.monthly_total)} × 12 meses = ${formatMoney(p.monthly_total * 12)} no primeiro ano`}
                />
              )}
              {p.yearly_total > 0 && (
                <Total label="Anuidade" value={`${formatMoney(p.yearly_total)} / ano`} />
              )}
              {p.discount_total > 0 && (
                <Total
                  label="Você economiza"
                  value={formatMoney(p.discount_total)}
                  tone="text-foreground"
                />
              )}
              <div className="border-t border-border pt-2">
                <Total label="Total no 1º ano" value={formatMoney(p.total)} strong />
              </div>
            </dl>
          </section>

          {p.conditions && (
            <section
              className="print-break rounded-[24px] border border-border bg-surface p-5 sm:p-7"
              aria-labelledby="pp-cond"
            >
              <h2 id="pp-cond" className="eyebrow mb-3">
                Condições
              </h2>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {p.conditions}
              </p>
            </section>
          )}

          {print && p.accepted_at && (
            <p className="text-[12px] text-muted-foreground">
              Aceita eletronicamente por {p.accepted_name} em{" "}
              {new Date(p.accepted_at).toLocaleString("pt-BR")}.
            </p>
          )}
        </div>

        {!print && (
          <aside className="no-print lg:sticky lg:top-6 lg:self-start">
            <ActionPanel token={token} data={q.data} onChange={set} />
          </aside>
        )}
      </main>
      {!print && (
        <footer className="no-print pb-10 text-center text-[11px] text-subtle">
          Proposta enviada por {seller.name} pelo Nexus One · aceite eletrônico com registro de
          data, IP e navegador
        </footer>
      )}
    </div>
  );
}

function Total({
  label,
  value,
  hint,
  strong,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
        <dd
          className={cn("tabular-nums", strong && "font-display text-[20px] font-semibold", tone)}
        >
          {value}
        </dd>
      </div>
      {hint && <p className="text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

function ActionPanel({
  token,
  data,
  onChange,
}: {
  token: string;
  data: PublicProposal;
  onChange: (d: PublicProposal) => void;
}) {
  const p = data.proposal;
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const accept = useMutation({
    mutationFn: () => proposalAction(token, "accept", { name, document: doc }),
    onSuccess: (d) => {
      onChange(d);
      toast.success("Proposta aceita. Obrigado!");
    },
    onError: () => toast.error("Não deu para aceitar agora. Confira a conexão e tente de novo."),
  });
  const decline = useMutation({
    mutationFn: () => proposalAction(token, "decline", { reason }),
    onSuccess: (d) => onChange(d),
    onError: () => toast.error("Não deu para registrar a recusa. Tente de novo em instantes."),
  });
  const pay = useMutation({
    mutationFn: (billingType: string) => proposalAction(token, "pay", { billingType }),
    onSuccess: (d) => onChange(d),
    onError: () =>
      toast.error(
        "Não deu para gerar a cobrança. Tente outra forma de pagamento ou fale com quem enviou a proposta.",
      ),
  });

  const docOk = doc.replace(/\D/g, "").length === 11 ? isValidCpf(doc) : isValidCnpj(doc);
  const card = "rounded-[24px] border border-border bg-surface p-5 ";

  if (p.status === "expired")
    return (
      <div className={card}>
        <p className="font-semibold">Esta proposta expirou</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Fale com {data.seller.name} para receber uma versão atualizada.
        </p>
      </div>
    );
  if (p.status === "declined")
    return (
      <div className={card}>
        <p className="font-semibold">Proposta recusada</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Obrigado pelo retorno. {data.seller.name} já foi avisado.
        </p>
      </div>
    );

  if (p.status === "accepted") {
    const charges = data.charges ?? [];
    const payments = data.payments;
    return (
      <div className="space-y-4">
        <div className={cn(card, "bg-[#0A1F3B] text-white")}>
          <CheckCircle2 className="size-7 text-white" />
          <p className="mt-3 font-display text-[20px] font-semibold">Proposta aceita</p>
          <p className="mt-1 text-[13px] text-white/70">
            Por {p.accepted_name} em{" "}
            {p.accepted_at ? new Date(p.accepted_at).toLocaleString("pt-BR") : "—"}.
          </p>
        </div>
        {charges.length > 0 ? (
          <div className={card}>
            <p className="eyebrow mb-3">Pagamento</p>
            {charges.map((c) => (
              <div key={c.id} className="mb-4 last:mb-0">
                <p className="text-[14px] font-semibold">
                  {formatMoney(c.amount)}
                  {c.kind === "subscription" ? " · recorrente" : ""}
                </p>
                {c.pix_image && (
                  <img
                    src={`data:image/png;base64,${c.pix_image}`}
                    alt="QR code Pix"
                    className="mx-auto my-3 size-48"
                  />
                )}
                <div className="mt-2 grid gap-2">
                  {c.pix_payload && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(c.pix_payload!)
                          .then(() => toast.success("Código Pix copiado"))
                      }
                    >
                      <Copy /> Copiar código Pix
                    </Button>
                  )}
                  {c.invoice_url && (
                    <Button asChild>
                      <a href={c.invoice_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Abrir fatura
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : payments.length > 0 ? (
          <div className={card}>
            <p className="eyebrow mb-3">Pagamento</p>
            {payments.map((y, i) => (
              <div
                key={i}
                className="mb-3 flex items-center justify-between gap-3 text-[13px] last:mb-0"
              >
                <span>
                  {formatMoney(y.amount)}
                  {y.cycle === "MONTHLY" ? " / mês" : y.cycle === "YEARLY" ? " / ano" : ""}
                  <span className="block text-[11px] text-subtle">
                    {y.status === "confirmed" || y.status === "received"
                      ? "Pago"
                      : "Aguardando pagamento"}
                  </span>
                </span>
                {y.invoice_url && y.status !== "confirmed" && y.status !== "received" && (
                  <Button size="sm" asChild>
                    <a href={y.invoice_url} target="_blank" rel="noopener noreferrer">
                      Pagar
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : data.can_pay ? (
          <div className={card}>
            <p className="eyebrow mb-1">Pagamento</p>
            <p className="mb-4 text-[13px] text-muted-foreground">
              Escolha como prefere pagar. A cobrança sai no nome informado no aceite.
            </p>
            <div className="grid gap-2">
              {(
                [
                  ["PIX", "Pix (na hora)", QrCode],
                  ["BOLETO", "Boleto", Landmark],
                  ["CREDIT_CARD", "Cartão de crédito", CreditCard],
                ] as const
              ).map(([id, label, Icon]) => (
                <Button
                  key={id}
                  variant="outline"
                  className="justify-start"
                  disabled={pay.isPending}
                  onClick={() => pay.mutate(id)}
                >
                  {pay.isPending && pay.variables === id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Icon />
                  )}{" "}
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className={card}>
            <p className="text-[13px] text-muted-foreground">
              {data.seller.name} vai entrar em contato com os próximos passos.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className={card}
      onSubmit={(e) => {
        e.preventDefault();
        if (!agree || !docOk || name.trim().length < 3) return;
        accept.mutate();
      }}
    >
      <p className="font-display text-[18px] font-semibold">Aceitar a proposta</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Leva menos de um minuto. Registramos data, hora, IP e navegador como comprovante.
      </p>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pp-name">Nome completo</Label>
          <Input
            id="pp-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pp-doc">CPF ou CNPJ</Label>
          <Input
            id="pp-doc"
            inputMode="numeric"
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            onBlur={() => setDoc(formatDocument(doc))}
            aria-invalid={doc.length > 0 && !docOk}
          />
          {doc.length > 0 && !docOk && <p className="text-[11px] text-danger">Confira o número.</p>}
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox
            checked={agree}
            onCheckedChange={(c) => setAgree(Boolean(c))}
            className="mt-0.5"
          />
          Li e concordo com os itens, valores e condições desta proposta.
        </label>
        <Button
          type="submit"
          size="lg"
          disabled={accept.isPending || !agree || !docOk || name.trim().length < 3}
        >
          {accept.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Aceitar
          proposta
        </Button>
      </div>
      {declining ? (
        <div className="mt-4 grid gap-2 border-t border-border pt-4">
          <Label htmlFor="pp-reason">Pode contar o motivo? (opcional)</Label>
          <Textarea
            id="pp-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              Recusar proposta
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDeclining(true)}
          className="mt-4 w-full text-center text-[12px] text-subtle hover:text-foreground"
        >
          Não tenho interesse agora
        </button>
      )}
    </form>
  );
}
