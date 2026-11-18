import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Globe,
  Inbox,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyField } from "@/features/channels/CopyField";
import { useIntegration } from "@/features/integrations/api";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { patchAccountSettings } from "@/features/settings/api";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useDomainCheck, useEmailDomains, useEmailHealth, useEmailSetupInfo } from "./api";
import { pct } from "./pct";
import type { DnsCheck } from "./dns";
import { BrandIcon, BrandTile } from "@/components/brand/BrandIcon";

// Ajustes › E-mail: domínio e DNS, remetente, assinatura, webhooks e saúde da entrega.
export function EmailSettingsTab() {
  const { current, isManager, isAdmin } = useAccount();
  const accountId = current!.accountId;
  return (
    <div className="space-y-6">
      <SenderCard accountId={accountId} />
      {isManager && <DomainCard accountId={accountId} />}
      <SignatureCard accountId={accountId} canEdit={isManager} />
      {isManager && <HealthCard accountId={accountId} />}
      {isAdmin && <SetupCard accountId={accountId} />}
      <MailboxesCard />
    </div>
  );
}

function SenderCard({ accountId }: { accountId: string }) {
  const resend = useIntegration(accountId, "resend");
  const st = resend.data;
  return (
    <SettingsCard
      title="Remetente"
      description="Os e-mails saem pelo Resend da sua empresa, com o seu domínio."
    >
      {st && st.status !== "off" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4 text-[13px]">
          <BrandTile id="resend" size={28} />
          <span className="flex-1">
            <b>{st.config["from_name"] ?? "Sua empresa"}</b> &lt;
            {st.config["from_email"] ?? "sem remetente"}&gt;
            {st.config["reply_to"] && (
              <span className="text-subtle"> · respostas para {st.config["reply_to"]}</span>
            )}
          </span>
          <span
            className={cn(
              "text-[12px] font-medium",
              st.status === "connected" ? "text-foreground" : "text-danger",
            )}
          >
            {st.status === "connected"
              ? "Conectado"
              : st.status === "error"
                ? "Com erro"
                : "Falta testar"}
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link to="/ajustes" search={{ aba: "integracoes" }}>
              Alterar
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
          <span className="flex-1">
            Nenhum remetente. Conecte o Resend com a chave da sua conta e o e-mail do domínio
            verificado.
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link to="/ajustes" search={{ aba: "integracoes" }}>
              <BrandIcon id="resend" size={14} />
              Conectar Resend
            </Link>
          </Button>
        </div>
      )}
      {st?.last_error && (
        <p className="mt-3 rounded-xl bg-note px-3 py-2 text-[12px] text-note-fg">
          {st.last_error}
        </p>
      )}
    </SettingsCard>
  );
}

function DomainCard({ accountId }: { accountId: string }) {
  const domains = useEmailDomains(accountId);
  const check = useDomainCheck(accountId);
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<(DnsCheck & { domain: string }) | null>(null);
  const last = domains.data?.[domains.data.length - 1];
  useEffect(() => {
    if (last && !domain) setDomain(last.domain);
  }, [last, domain]);
  const shown =
    result ??
    (last?.records && (last.records as unknown as DnsCheck).spf
      ? { ...(last.records as unknown as DnsCheck), domain: last.domain }
      : null);

  return (
    <SettingsCard
      title="Domínio de envio"
      description="Conferimos o DNS de verdade: SPF, DKIM e DMARC alinhados são exigência do Gmail, Yahoo e Microsoft para quem envia em volume."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check.mutate(domain, {
            onSuccess: (r) => setResult(r),
            onError: (er) => toast.error(errorMessage(er)),
          });
        }}
      >
        <div className="relative flex-1">
          <Globe className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="suaempresa.com.br"
            className="pl-9"
            aria-label="Domínio"
          />
        </div>
        <Button type="submit" variant="outline" disabled={check.isPending || !domain.trim()}>
          {check.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verificar DNS
        </Button>
      </form>
      {shown && (
        <ul className="mt-4 space-y-2">
          <Check
            ok={shown.spf.ok}
            label="SPF"
            problem={shown.spf.problem}
            detail={shown.spf.records[0]}
          />
          <Check ok={shown.dkim.ok} label="DKIM (resend._domainkey)" problem={shown.dkim.problem} />
          <Check
            ok={shown.dmarc.ok}
            label={`DMARC${shown.dmarc.policy ? ` (p=${shown.dmarc.policy})` : ""}`}
            problem={shown.dmarc.problem}
            warn={shown.dmarc.ok && shown.dmarc.policy === "none"}
            detail={shown.dmarc.record ?? undefined}
          />
        </ul>
      )}
      {last?.checked_at && (
        <p className="mt-3 text-[11px] text-subtle">
          Última verificação de {last.domain}: {formatRelative(last.checked_at)}
          {last.warmup_started_at
            ? ` · aquecimento começou ${formatRelative(last.warmup_started_at)}`
            : ""}
        </p>
      )}
    </SettingsCard>
  );
}

function Check({
  ok,
  label,
  problem,
  warn,
  detail,
}: {
  ok: boolean;
  label: string;
  problem: string | null;
  warn?: boolean;
  detail?: string | undefined;
}) {
  const Icon = ok ? (warn ? CircleAlert : CheckCircle2) : XCircle;
  return (
    <li className="flex gap-3 rounded-xl border border-border px-3 py-2.5">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          ok ? (warn ? "text-note-fg" : "text-foreground") : "text-danger",
        )}
      />
      <div className="min-w-0 text-[13px]">
        <p className="font-medium">{label}</p>
        {problem && <p className="text-[12px] text-muted-foreground">{problem}</p>}
        {detail && <p className="truncate font-mono text-[11px] text-subtle">{detail}</p>}
      </div>
    </li>
  );
}

function SignatureCard({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  const { current } = useAccount();
  const qc = useQueryClient();
  const saved = ((current!.settings as Record<string, unknown>)["email"] ?? {}) as {
    signature?: string;
    address?: string;
  };
  const [signature, setSignature] = useState(saved.signature ?? "");
  const [address, setAddress] = useState(saved.address ?? "");
  const save = useMutation({
    mutationFn: () =>
      patchAccountSettings(accountId, (cur) => ({
        ...cur,
        email: { ...((cur["email"] as Record<string, string>) ?? {}), signature, address },
      })),
    onSuccess: () => {
      toast.success("Assinatura salva");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsCard
      title="Assinatura e endereço"
      description="A assinatura entra no fim dos e-mails 1:1 e das respostas. O endereço físico vai no rodapé das campanhas (boa prática anti-spam)."
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="sig">Assinatura</Label>
          <Textarea
            id="sig"
            rows={4}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            disabled={!canEdit}
            placeholder={"Equipe Comercial\n(11) 0000-0000 · suaempresa.com.br"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="addr">Endereço da empresa</Label>
          <Input
            id="addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!canEdit}
            placeholder="Rua Exemplo, 100 · São Paulo/SP"
          />
        </div>
        {canEdit && (
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function HealthCard({ accountId }: { accountId: string }) {
  const h = useEmailHealth(accountId).data;
  return (
    <SettingsCard
      title="Saúde da entrega (30 dias)"
      description="Spam acima de 0,3% faz o Gmail recusar seus e-mails. Bounce alto queima o domínio."
    >
      {!h ? (
        <Loader2 className="mx-auto my-4 animate-spin text-subtle" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Enviados" value={String(h.sent)} />
          <Stat label="Abertura" value={pct(h.openRate)} />
          <Stat label="Bounce" value={pct(h.bounceRate)} level={h.bounceLevel} />
          <Stat label="Spam" value={pct(h.spamRate, 2)} level={h.spamLevel} />
        </div>
      )}
    </SettingsCard>
  );
}

function Stat({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level?: "ok" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        level === "bad"
          ? "border-danger"
          : level === "warn"
            ? "border-note-line bg-note"
            : "border-border",
      )}
    >
      <p className="font-display text-[20px] font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-subtle">{label}</p>
    </div>
  );
}

function SetupCard({ accountId }: { accountId: string }) {
  const info = useEmailSetupInfo(accountId, true);
  return (
    <SettingsCard
      title="Webhooks do e-mail"
      description="Cole estes endereços no painel do Resend. Sem o webhook, entrega, bounce e reclamação não são registrados (e a integração mostra erro)."
    >
      {info.isPending ? (
        <Loader2 className="mx-auto my-4 animate-spin text-subtle" />
      ) : info.data ? (
        <div className="grid gap-4">
          <CopyField
            label="Webhook de eventos (Resend › Webhooks: delivered, bounced, complained)"
            value={info.data.resendWebhook}
          />
          <p className="-mt-2 text-[11px] text-subtle">
            Depois de criar, copie o “signing secret” do Resend em Ajustes › Integrações › Resend ›
            Segredo do webhook.
          </p>
          <CopyField
            label="Caixa compartilhada (Resend Inbound ou encaminhamento de e-mail)"
            value={info.data.inboundUrl}
          />
          <p className="-mt-2 inline-flex items-center gap-1.5 text-[11px] text-subtle">
            <Inbox className="size-3" /> E-mails recebidos viram conversas na Caixa de entrada e são
            respondidos por lá.
          </p>
        </div>
      ) : (
        <p className="text-[12px] text-danger">{errorMessage(info.error)}</p>
      )}
    </SettingsCard>
  );
}

function MailboxesCard() {
  return (
    <SettingsCard
      title="Gmail e Outlook do vendedor"
      description="Sincronizar a caixa pessoal de cada vendedor (enviar pelo Gmail dele e ver as respostas no CRM)."
    >
      <div className="rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
        <div className="mb-2 flex items-center gap-2" aria-hidden>
          <BrandTile id="gmail" size={28} />
          <BrandTile id="outlook" size={28} />
        </div>
        <p className="font-medium text-foreground">Em preparação</p>
        <p className="mt-1">
          Precisa do aplicativo OAuth da empresa no Google Cloud e no Microsoft Entra (Ajustes ›
          Integrações › Google / Microsoft). Para ler a caixa do Gmail, o Google exige uma
          verificação de segurança do aplicativo, que leva algumas semanas. Até lá, os e-mails 1:1
          saem pelo domínio da empresa com a resposta indo para o e-mail do vendedor.
        </p>
      </div>
    </SettingsCard>
  );
}
