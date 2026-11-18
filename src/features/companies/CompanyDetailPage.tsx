import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { EmptyState } from "@/components/common/EmptyState";
import { TempChip } from "@/components/common/TempChip";
import { ConfirmButton } from "@/components/common/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamMembers } from "@/features/contacts/api";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";
import { fieldsFor, formatFieldValue, useCustomFields } from "@/features/custom-fields/api";
import { useAccount } from "@/lib/account";
import { formatMoney, formatPhone, formatRelative, initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import {
  SIZE_LABEL,
  useCompany,
  useCompanyRelated,
  useDeleteCompany,
  useLinkContactsToCompany,
} from "./api";
import { CompanyDialog } from "./CompanyDialog";
import { CompanyTimeline } from "./CompanyTimeline";
import { formatCnpj } from "./cnpj";

const STATUS_LABEL: Record<string, string> = {
  open: "Na carteira",
  won: "Fidelizado",
  lost: "Perdido",
};

export function CompanyDetailPage({ companyId }: { companyId: string }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const navigate = useNavigate();
  const company = useCompany(accountId, companyId);
  const related = useCompanyRelated(accountId, companyId);
  const fields = useCustomFields(accountId);
  const team = useTeamMembers(accountId);
  const link = useLinkContactsToCompany(accountId);
  const remove = useDeleteCompany(accountId);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<PickedContact | null>(null);
  const owner = useMemo(
    () => (team.data ?? []).find((m) => m.userId === company.data?.owner_user_id)?.name,
    [team.data, company.data?.owner_user_id],
  );

  if (company.isPending) {
    return (
      <div className="space-y-4 p-6" aria-busy>
        <Skeleton className="h-20 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!company.data) {
    return (
      <EmptyState
        icon={Building2}
        title="Empresa não encontrada"
        description="Ela pode ter sido removida."
        action={
          <Button asChild variant="outline">
            <Link to="/empresas">Voltar para empresas</Link>
          </Button>
        }
      />
    );
  }

  const c = company.data;
  const addr = (c.address ?? {}) as Record<string, string>;
  const custom = (c.custom ?? {}) as Record<string, unknown>;
  const contacts = related.data?.contacts ?? [];
  const deals = related.data?.deals ?? [];
  const open = deals.filter((d) => d.status === "open");
  const won = deals.filter((d) => d.status === "won");
  const address = [
    addr["street"] && `${addr["street"]}${addr["number"] ? `, ${addr["number"]}` : ""}`,
    addr["district"],
    addr["city"] && `${addr["city"]}${addr["state"] ? `/${addr["state"]}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  async function addContact(p: PickedContact | null) {
    setPicking(p);
    if (!p) return;
    try {
      await link.mutateAsync({ companyId, contactIds: [p.id] });
      toast.success(`${p.name ?? "Contato"} vinculado a ${c.name}`);
      setPicking(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="ds-page-header px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
        <Link
          to="/empresas"
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Empresas
        </Link>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Empresa
            </p>
            <h1 className="truncate font-display text-[26px] leading-tight font-medium text-foreground sm:text-[30px]">
              {c.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted-foreground">
              {c.legal_name && c.legal_name !== c.name && <span>{c.legal_name}</span>}
              {c.cnpj && <span className="tabular-nums">{formatCnpj(c.cnpj)}</span>}
              {c.industry && <span>{c.industry}</span>}
              {c.size && <span>{SIZE_LABEL[c.size]}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Editar
            </Button>
            {isManager && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  remove.mutate(c.id, {
                    onSuccess: () => {
                      toast.success(
                        "Empresa removida. Os contatos e os cartões da carteira continuam, sem vínculo.",
                      );
                      void navigate({ to: "/empresas" });
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Trash2 /> Excluir
              </Button>
            )}
          </div>
        </div>
        {contacts.length === 0 && deals.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] text-muted-foreground">
            Sem pessoas nem cartões ainda. Vincule quem trabalha aqui na aba Pessoas e coloque o
            cliente na{" "}
            <Link
              to="/crm"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Carteira
            </Link>
            .
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Pessoas" value={String(contacts.length)} />
            <Kpi label="Na carteira" value={String(open.length)} />
            <Kpi
              label="Valor em contratos"
              value={formatMoney(
                open.reduce((s, d) => s + Number(d.value ?? 0), 0),
                true,
              )}
            />
            <Kpi
              label="Já fidelizado"
              value={formatMoney(
                won.reduce((s, d) => s + Number(d.value ?? 0), 0),
                true,
              )}
            />
          </div>
        )}
      </div>

      <div className="grid gap-6 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10">
        <Tabs defaultValue="timeline" className="min-w-0">
          <TabsList className="mb-4">
            <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
            <TabsTrigger value="people">Pessoas</TabsTrigger>
            <TabsTrigger value="deals">Carteira</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline">
            <CompanyTimeline companyId={companyId} />
          </TabsContent>
          <TabsContent value="people" className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-3">
              <UserPlus className="size-4 shrink-0 text-subtle" aria-hidden />
              <div className="flex-1">
                <ContactPicker
                  accountId={accountId}
                  value={picking}
                  onChange={(p) => void addContact(p)}
                />
              </div>
            </div>
            {contacts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nenhuma pessoa vinculada"
                description="Busque um contato acima para ligar à empresa."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {contacts.map((p) => (
                  <li key={p.id} className="group flex items-center gap-3 px-4 py-3">
                    <ContactAvatar name={p.name} src={p.avatar_url} size={36} />
                    <Link
                      to="/contatos/$contactId"
                      params={{ contactId: p.id }}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-[13px] font-medium hover:underline">
                        {p.name ?? "Sem nome"}
                      </p>
                      <p className="truncate text-[12px] text-subtle">
                        {[p.job_title, p.email, p.phone && formatPhone(p.phone)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </Link>
                    <TempChip level={p.temperature} score={p.score} />
                    <span className="hidden w-20 text-right text-[11px] text-subtle sm:block">
                      {formatRelative(p.last_interaction_at)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Desvincular ${p.name ?? "contato"}`}
                      onClick={() =>
                        link.mutate(
                          { companyId: null, contactIds: [p.id] },
                          { onError: (e) => toast.error(errorMessage(e)) },
                        )
                      }
                      className="rounded-full p-1.5 text-subtle opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="deals">
            {deals.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nenhum cartão desta empresa na carteira"
                description="Os cartões da carteira de pessoas desta empresa aparecem aqui quando vinculados."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link
                      to="/crm"
                      search={{ negocio: d.id }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{d.title}</p>
                        <p className="truncate text-[12px] text-subtle">
                          {(d.pipeline_stages as unknown as { name: string } | null)?.name ?? "—"} ·{" "}
                          {STATUS_LABEL[d.status] ?? d.status}
                        </p>
                      </div>
                      <span className="font-display text-[14px] font-semibold tabular-nums">
                        {formatMoney(d.value ?? 0)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <aside className="space-y-4">
          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3">Dados da empresa</p>
            <dl className="space-y-2.5 text-[13px]">
              {c.domain && (
                <Row icon={Globe}>
                  <a
                    href={`https://${c.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {c.domain} <ExternalLink className="size-3" />
                  </a>
                </Row>
              )}
              {c.phone && <Row icon={Phone}>{formatPhone(c.phone)}</Row>}
              {c.email && <Row icon={Mail}>{c.email}</Row>}
              {address && <Row icon={MapPin}>{address}</Row>}
              <Row icon={Users}>{owner ? `Responsável: ${owner}` : "Sem responsável"}</Row>
            </dl>
            {c.notes && (
              <p className="mt-4 rounded-xl bg-surface-2 p-3 text-[12px] whitespace-pre-wrap text-muted-foreground">
                {c.notes}
              </p>
            )}
          </section>
          {fieldsFor(fields.data, "company").length > 0 && (
            <section className="rounded-[24px] border border-border bg-surface p-5">
              <p className="eyebrow mb-3">Campos personalizados</p>
              <dl className="grid gap-2 text-[13px]">
                {fieldsFor(fields.data, "company").map((f) => (
                  <div key={f.id} className="flex justify-between gap-3">
                    <dt className="text-subtle">{f.label}</dt>
                    <dd className="text-right font-medium">{formatFieldValue(f, custom[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </aside>
      </div>
      <CompanyDialog accountId={accountId} open={editing} onOpenChange={setEditing} company={c} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="font-display text-[20px] font-semibold tabular-nums">{value}</p>
      <p className="text-[13px] text-subtle">{label}</p>
    </div>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Globe; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
