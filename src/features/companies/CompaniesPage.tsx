import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Plus, Search } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/features/contacts/api";
import { OwnerAvatar } from "@/features/contacts/components/OwnerAvatar";
import type { TeamMember } from "@/features/contacts/types";
import { useDebounced } from "@/features/contacts/useDebounced";
import { useAccountId } from "@/lib/account";
import { formatMoney, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { type CompanyRow, useCompanies } from "./api";
import { CompanyDialog } from "./CompanyDialog";
import { formatCnpj } from "./cnpj";

type Stage = "customer" | "negotiating" | "prospect";

const STAGE_LABEL: Record<Stage, string> = {
  customer: "Cliente",
  negotiating: "Em negociação",
  prospect: "Sem negócio aberto",
};

const STAGE_CLASS: Record<Stage, string> = {
  customer: "bg-primary text-primary-foreground",
  negotiating: "border border-border-strong bg-surface text-foreground",
  prospect: "bg-surface-3 text-muted-foreground",
};

// Situação da conta lida dos negócios: ganhou algum = cliente; tem aberto = negociação.
function stageOf(c: CompanyRow): Stage {
  if (c.won_deals > 0) return "customer";
  if (c.open_deals > 0) return "negotiating";
  return "prospect";
}

// Empresas (B2B): quem compra, quantas pessoas e quanto está em jogo em cada conta.
export function CompaniesPage() {
  const accountId = useAccountId();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const term = useDebounced(q, 250);
  const companies = useCompanies(accountId, term);
  const team = useTeamMembers(accountId);
  const [creating, setCreating] = useState(false);
  const members = useMemo(() => new Map((team.data ?? []).map((m) => [m.userId, m])), [team.data]);
  const list = companies.data ?? [];
  const totalOpen = list.reduce((s, c) => s + c.open_value, 0);
  const customers = list.filter((c) => c.won_deals > 0).length;

  const description = companies.data
    ? `${list.length} empresa${list.length === 1 ? "" : "s"} na carteira · ${customers} cliente${customers === 1 ? "" : "s"} · ${formatMoney(totalOpen, true)} em negócios abertos`
    : "Contas, pessoas e negócios por empresa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Empresas"
        description={description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> <span className="hidden sm:inline">Nova empresa</span>
            <span className="sm:hidden">Nova</span>
          </Button>
        }
      >
        <SearchBox value={q} onChange={setQ} className="hidden w-72 md:block" />
      </PageHeader>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 md:hidden">
          <SearchBox value={q} onChange={setQ} />
        </div>
        {companies.isPending ? (
          <div className="space-y-2 p-4 sm:p-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : companies.isError ? (
          <EmptyState
            icon={Building2}
            title="Não deu para carregar as empresas"
            description="Confira a conexão e tente de novo."
            action={<Button onClick={() => void companies.refetch()}>Tentar de novo</Button>}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={term ? "Nenhuma empresa encontrada" : "Cadastre a primeira empresa"}
            description={
              term
                ? "Tente outro nome ou o CNPJ só com números."
                : "Agrupe contatos e negócios por conta. Digite o CNPJ e os dados da Receita vêm sozinhos."
            }
            action={
              !term && (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nova empresa
                </Button>
              )
            }
          />
        ) : (
          <>
            <CompaniesTable rows={list} members={members} />
            <CompaniesMobileList rows={list} members={members} />
          </>
        )}
      </div>
      <CompanyDialog
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => void navigate({ to: "/empresas/$companyId", params: { companyId: c.id } })}
      />
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por nome, CNPJ ou site"
        className="pl-9"
        aria-label="Buscar empresas"
      />
    </div>
  );
}

function CompanyMark({ name }: { name: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  );
}

function StagePill({ stage }: { stage: Stage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STAGE_CLASS[stage],
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

function OwnerCell({ member }: { member: TeamMember | undefined }) {
  return (
    <span className="flex items-center gap-2">
      <OwnerAvatar member={member} size={24} />
      <span className={cn("truncate text-[13px]", !member && "text-subtle")}>
        {member ? member.name.split(" ")[0] : "Sem responsável"}
      </span>
    </span>
  );
}

function CompaniesTable({
  rows,
  members,
}: {
  rows: CompanyRow[];
  members: Map<string, TeamMember>;
}) {
  const navigate = useNavigate();
  return (
    <div className="hidden px-6 pb-8 md:block">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th
              scope="col"
              className="eyebrow w-[34%] border-b border-border px-3 py-4 whitespace-nowrap"
            >
              Empresa
            </th>
            <th scope="col" className="eyebrow border-b border-border px-3 py-4 whitespace-nowrap">
              CNPJ
            </th>
            <th
              scope="col"
              className="eyebrow border-b border-border px-3 py-4 whitespace-nowrap text-right"
            >
              Pessoas
            </th>
            <th
              scope="col"
              className="eyebrow border-b border-border px-3 py-4 whitespace-nowrap text-right"
            >
              Em aberto
            </th>
            <th scope="col" className="eyebrow border-b border-border px-3 py-4 whitespace-nowrap">
              Situação
            </th>
            <th
              scope="col"
              className="eyebrow hidden border-b border-border px-3 py-4 whitespace-nowrap lg:table-cell"
            >
              Responsável
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              className="group cursor-pointer transition-colors duration-200 hover:bg-[var(--wash)]"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button")) return;
                void navigate({ to: "/empresas/$companyId", params: { companyId: c.id } });
              }}
            >
              <td className="border-b border-border px-3 py-3.5">
                <div className="flex items-center gap-3">
                  <CompanyMark name={c.name} />
                  <div className="min-w-0">
                    <Link
                      to="/empresas/$companyId"
                      params={{ companyId: c.id }}
                      className="block truncate rounded text-[14px] font-semibold text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {c.name}
                    </Link>
                    {(c.industry || c.domain) && (
                      <span className="mt-1 inline-flex max-w-full truncate rounded-full border border-border px-2 py-px text-[11px] text-muted-foreground">
                        {c.industry ?? c.domain}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-border px-3 py-3.5 font-mono text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                {c.cnpj ? formatCnpj(c.cnpj) : <span className="font-sans text-subtle">—</span>}
              </td>
              <td className="border-b border-border px-3 py-3.5 text-right text-[14px] tabular-nums">
                {c.contacts_count}
              </td>
              <td
                className={cn(
                  "border-b border-border px-3 py-3.5 text-right font-display text-[15px] font-semibold whitespace-nowrap tabular-nums",
                  c.open_value === 0 && "font-normal text-subtle",
                )}
              >
                {formatMoney(c.open_value)}
                {c.open_deals > 0 && (
                  <span className="block font-sans text-[11px] font-normal text-subtle">
                    {c.open_deals} negócio{c.open_deals === 1 ? "" : "s"}
                  </span>
                )}
              </td>
              <td className="border-b border-border px-3 py-3.5">
                <StagePill stage={stageOf(c)} />
              </td>
              <td className="hidden border-b border-border px-3 py-3.5 lg:table-cell">
                <OwnerCell member={c.owner_user_id ? members.get(c.owner_user_id) : undefined} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompaniesMobileList({
  rows,
  members,
}: {
  rows: CompanyRow[];
  members: Map<string, TeamMember>;
}) {
  return (
    <ul className="divide-y divide-border px-4 pt-2 pb-6 md:hidden">
      {rows.map((c) => {
        const member = c.owner_user_id ? members.get(c.owner_user_id) : undefined;
        return (
          <li key={c.id}>
            <Link
              to="/empresas/$companyId"
              params={{ companyId: c.id }}
              className="flex items-start gap-3 rounded-xl py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <CompanyMark name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[14px] font-semibold">{c.name}</p>
                  <p className="shrink-0 font-display text-[14px] font-semibold tabular-nums">
                    {formatMoney(c.open_value, true)}
                  </p>
                </div>
                <p className="truncate text-[12px] text-subtle">
                  {[c.cnpj ? formatCnpj(c.cnpj) : null, c.industry].filter(Boolean).join(" · ") ||
                    c.domain ||
                    "CNPJ ainda não consultado na Receita"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <StagePill stage={stageOf(c)} />
                  <span>
                    {c.contacts_count} pessoa{c.contacts_count === 1 ? "" : "s"}
                  </span>
                  {member && <span className="truncate">· {member.name.split(" ")[0]}</span>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
