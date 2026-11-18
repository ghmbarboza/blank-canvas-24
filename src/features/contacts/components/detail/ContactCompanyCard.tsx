import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CompanyDialog } from "@/features/companies/CompanyDialog";
import { useLinkContactsToCompany } from "@/features/companies/api";
import { formatCnpj } from "@/features/companies/cnpj";
import { CustomFieldsEditor } from "@/features/custom-fields/CustomFieldsEditor";
import { fieldsFor, formatFieldValue, useCustomFields } from "@/features/custom-fields/api";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useUpdateContact } from "../../api";
import type { ContactRow } from "../../types";

// Empresa do contato (B2B) e os campos personalizados dele.
export function ContactCompanyCard({
  accountId,
  contact,
}: {
  accountId: string;
  contact: ContactRow;
}) {
  const link = useLinkContactsToCompany(accountId);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const company = useQuery({
    queryKey: ["company-lite", contact.company_id],
    enabled: Boolean(contact.company_id),
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, cnpj, industry")
        .eq("id", contact.company_id!)
        .maybeSingle();
      return data;
    },
  });
  const results = useQuery({
    queryKey: ["company-search", accountId, term],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, name, cnpj")
        .eq("account_id", accountId)
        .order("name")
        .limit(8);
      const t = term.trim().replace(/[%*,()]/g, " ");
      if (t) q = q.ilike("name", `%${t}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  async function choose(companyId: string | null) {
    try {
      await link.mutateAsync({ companyId, contactIds: [contact.id] });
      void qc.invalidateQueries({ queryKey: ["contacts", accountId] });
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const c = company.data;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Empresa">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Empresa</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              {c ? <Pencil className="size-3" /> : <Plus className="size-3" />}{" "}
              {c ? "Trocar" : "Vincular"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <div className="relative mb-2">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
              <Input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar empresa"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto">
              {results.isPending && (
                <Loader2 className="mx-auto my-3 size-4 animate-spin text-subtle" />
              )}
              {(results.data ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void choose(r.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.id === contact.company_id && <Check className="size-3.5 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex gap-1 border-t border-border pt-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
              >
                <Plus /> Nova empresa
              </Button>
              {c && (
                <Button size="sm" variant="ghost" onClick={() => void choose(null)}>
                  <X /> Desvincular
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {c ? (
        <Link
          to="/empresas/$companyId"
          params={{ companyId: c.id }}
          className="flex items-center gap-3 rounded-xl p-2 -m-2 hover:bg-surface-2"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-[12px] font-semibold text-primary-foreground">
            {initials(c.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">{c.name}</span>
            <span className="block truncate text-[12px] text-subtle">
              {[c.cnpj && formatCnpj(c.cnpj), c.industry].filter(Boolean).join(" · ") ||
                "Ver empresa"}
            </span>
          </span>
        </Link>
      ) : (
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Building2 className="size-4 text-subtle" />{" "}
          {contact.company
            ? `"${contact.company}" ainda não é uma empresa cadastrada.`
            : "Sem empresa vinculada."}
        </p>
      )}
      <CustomFieldsSummary accountId={accountId} contact={contact} />
      <CompanyDialog
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        company={null}
        onSaved={(co) => void choose(co.id)}
      />
    </section>
  );
}

function CustomFieldsSummary({ accountId, contact }: { accountId: string; contact: ContactRow }) {
  const fields = useCustomFields(accountId);
  const update = useUpdateContact(accountId);
  const [editing, setEditing] = useState(false);
  const list = fieldsFor(fields.data, "contact");
  const [values, setValues] = useState<Record<string, unknown>>(
    (contact.custom as Record<string, unknown>) ?? {},
  );
  if (list.length === 0) return null;
  const custom = (contact.custom as Record<string, unknown>) ?? {};
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">Campos personalizados</p>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValues(custom);
              setEditing(true);
            }}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Editar
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <CustomFieldsEditor
            accountId={accountId}
            entity="contact"
            values={values}
            onChange={setValues}
            compact
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: contact.id, patch: { custom: values as never } },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      toast.success("Campos salvos");
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid gap-1.5 text-[12px]">
          {list.map((f) => (
            <div key={f.id} className="flex justify-between gap-3">
              <dt className="text-subtle">{f.label}</dt>
              <dd className="text-right font-medium">{formatFieldValue(f, custom[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
