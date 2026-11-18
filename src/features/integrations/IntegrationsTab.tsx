import { useEffect, useState } from "react";
import {
  BrainCircuit,
  CalendarDays,
  CreditCard,
  ExternalLink,
  FileSignature,
  Loader2,
  Magnet,
  Mail,
  Mic,
  Phone,
  ShieldCheck,
  Video,
  type LucideIcon,
  KanbanSquare,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { BrandTile } from "@/components/brand/BrandIcon";
import { hasBrandLogo } from "@/components/brand/brand-meta";
import { cn } from "@/lib/utils";

import { AiChoiceCard } from "@/features/channels/IntegrationsSection";
import { useIntegrations, useTestIntegration, type ProviderState } from "./api";
import { ProviderForm } from "./ProviderForm";
import { VISIBLE_PROVIDERS, type ProviderDef } from "./providers";
import { EditionIntegrations } from "./EditionIntegrations";
import { EDITION } from "@/lib/edition";

// A IA própria (OpenAI/Anthropic) tem o cartão de escolha no topo, com a volta para a IA inclusa.
const AI_IDS = new Set<ProviderDef["id"]>(["openai", "anthropic"]);

type Status = ProviderState["status"];

// Três estados que qualquer pessoa entende; "salva, falta testar" é um caso de "falta configurar".
const STATUS: Record<Status, { label: string; tone: string; live?: boolean }> = {
  off: { label: "Falta configurar", tone: "bg-surface-2 text-muted-foreground" },
  pending: { label: "Falta testar", tone: "bg-surface-2 text-muted-foreground" },
  connected: { label: "Conectado", tone: "bg-success/10 text-success", live: true },
  error: { label: "Com problema", tone: "bg-danger/8 text-danger" },
};

const CATEGORY_ICON: Record<ProviderDef["category"], LucideIcon> = {
  "Inteligência artificial": BrainCircuit,
  "E-mail": Mail,
  Reuniões: Video,
  "Telefonia e voz": Phone,
  Transcrição: Mic,
  Pagamentos: CreditCard,
  "Agenda e e-mail": CalendarDays,
  Captação: Magnet,
  Contratos: FileSignature,
  CRM: KanbanSquare,
  Segurança: ShieldCheck,
};

function helpText(def: ProviderDef, st: ProviderState | undefined): string {
  const status = st?.status ?? "off";
  if (status === "error")
    return st?.last_error
      ? `O último teste falhou: ${st.last_error}`
      : "O último teste falhou. Confira os dados e teste de novo.";
  if (status === "pending")
    return def.testable
      ? "Os dados estão salvos, mas a conexão ainda não foi testada. Clique em Testar."
      : "Salvo. Esta integração não tem teste automático.";
  if (status === "connected")
    return st?.updated_at
      ? `Funcionando. Última verificação ${formatRelative(st.updated_at)}.`
      : "Funcionando.";
  return `Ainda não ligado. Clique em Configurar e cole os dados da sua conta ${def.name}.`;
}

// Integrações externas: cada uma liga um módulo (e-mail, reunião, telefonia, cobrança).
export function IntegrationsTab() {
  // Edição enxuta: só as integrações dos canais do produto (ver src/lib/edition.ts).
  return EDITION.allIntegrations ? <AllIntegrationsTab /> : <EditionIntegrations />;
}

function AllIntegrationsTab() {
  const { current, isAdmin } = useAccount();
  const accountId = current!.accountId;
  const { data, isPending, isError, error } = useIntegrations(accountId);
  const test = useTestIntegration(accountId);
  const [open, setOpen] = useState<ProviderDef | null>(null);
  const [testing, setTesting] = useState<ProviderDef["id"] | null>(null);
  const PROVIDERS = isAdmin
    ? VISIBLE_PROVIDERS.filter((p) => !AI_IDS.has(p.id))
    : VISIBLE_PROVIDERS;
  const categories = [...new Set(PROVIDERS.map((p) => p.category))];
  const connected = (data ?? []).filter((s) => s.status === "connected").length;
  const problems = (data ?? []).filter((s) => s.status === "error").length;

  function runTest(def: ProviderDef) {
    setTesting(def.id);
    test.mutate(def.id, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e) => toast.error(errorMessage(e)),
      onSettled: () => setTesting(null),
    });
  }

  return (
    <SettingsCard
      title="Integrações"
      description={
        isPending || isError
          ? "Serviços que ligam e-mail, reuniões, telefonia, transcrição e cobrança."
          : `${connected} de ${PROVIDERS.length} conectadas${problems ? `, ${problems} com problema` : ""}. As chaves ficam no cofre, nunca à vista.`
      }
      readOnlyNote={isAdmin ? undefined : "Só administradores conectam e testam integrações."}
    >
      {isPending ? (
        <Loader2 className="mx-auto my-8 animate-spin text-subtle" aria-label="Carregando" />
      ) : (
        <div className="space-y-6">
          {isError && (
            <p className="rounded-lg bg-danger/8 px-3 py-2 text-[13px] text-danger">
              Não deu para conferir o estado das integrações agora: {errorMessage(error)}. Você
              ainda pode configurar cada uma.
            </p>
          )}
          {isAdmin && EDITION.ownAiKey && (
            <section aria-label="Inteligência artificial">
              <h3 className="mb-2 text-[12px] font-medium text-subtle">Inteligência artificial</h3>
              <AiChoiceCard accountId={accountId} />
            </section>
          )}
          {categories.map((cat) => (
            <section key={cat} aria-label={cat}>
              <h3 className="mb-1 text-[12px] font-medium text-subtle">{cat}</h3>
              <ul className="divide-y divide-border border-t border-border">
                {PROVIDERS.filter((p) => p.category === cat).map((p) => (
                  <IntegrationRow
                    key={p.id}
                    def={p}
                    state={data?.find((s) => s.id === p.id)}
                    isAdmin={isAdmin}
                    isUnknown={isError}
                    isTesting={testing === p.id}
                    onConfigure={() => setOpen(p)}
                    onTest={() => runTest(p)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <ProviderSheet
        accountId={accountId}
        def={open}
        state={data?.find((s) => s.id === open?.id)}
        onClose={() => setOpen(null)}
      />
    </SettingsCard>
  );
}

function IntegrationRow({
  def,
  state,
  isAdmin,
  isUnknown,
  isTesting,
  onConfigure,
  onTest,
}: {
  def: ProviderDef;
  state: ProviderState | undefined;
  isAdmin: boolean;
  isUnknown: boolean;
  isTesting: boolean;
  onConfigure: () => void;
  onTest: () => void;
}) {
  const status = state?.status ?? "off";
  const meta = isUnknown
    ? { label: "Sem leitura", tone: "bg-surface-2 text-muted-foreground", live: false }
    : STATUS[status];
  const Icon = CATEGORY_ICON[def.category];
  const canTest = def.testable && (status !== "off" || isUnknown);
  const configureLabel =
    status === "off" ? "Configurar" : status === "error" ? "Corrigir" : "Editar";
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        {hasBrandLogo(def.id) ? (
          <BrandTile id={def.id} size={40} className="shrink-0" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground">
            <Icon className="size-[18px]" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{def.name}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                meta.tone,
              )}
            >
              {meta.live && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {def.description}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[12px]",
              status === "error" ? "line-clamp-3 text-danger" : "text-subtle",
            )}
          >
            {isUnknown ? "Não deu para conferir agora." : helpText(def, state)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-[52px] sm:pl-0">
        {canTest && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isAdmin || isTesting}
            onClick={onTest}
            aria-label={`Testar ${def.name}`}
          >
            {isTesting && <Loader2 className="animate-spin" aria-hidden />}
            Testar
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isAdmin}
          onClick={onConfigure}
          aria-label={`${configureLabel} ${def.name}`}
        >
          {configureLabel}
        </Button>
      </div>
    </li>
  );
}

function ProviderSheet({
  accountId,
  def,
  state,
  onClose,
}: {
  accountId: string;
  def: ProviderDef | null;
  state: ProviderState | undefined;
  onClose: () => void;
}) {
  if (!def) return null;
  return (
    <Sheet open={Boolean(def)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{def.name}</SheetTitle>
          <SheetDescription>{def.description}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 px-4 pb-6">
          <ProviderForm key={def.id} accountId={accountId} def={def} state={state} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
