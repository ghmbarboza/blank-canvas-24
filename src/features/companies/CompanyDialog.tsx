import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OwnerSelect } from "@/features/contacts/components/OwnerSelect";
import { useTeamMembers } from "@/features/contacts/api";
import { CustomFieldsEditor } from "@/features/custom-fields/CustomFieldsEditor";
import { errorMessage } from "@/lib/functions";

import { SIZE_LABEL, useSaveCompany, type Company } from "./api";
import { formatCnpj, isValidCnpj, lookupCnpj, onlyDigits } from "./cnpj";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: Company | null;
  onSaved?: (c: Company) => void;
}

interface Form {
  name: string;
  legal_name: string;
  cnpj: string;
  domain: string;
  industry: string;
  size: string;
  phone: string;
  email: string;
  website: string;
  owner_user_id: string | null;
  notes: string;
  address: Record<string, string>;
  custom: Record<string, unknown>;
}

const EMPTY: Form = {
  name: "",
  legal_name: "",
  cnpj: "",
  domain: "",
  industry: "",
  size: "",
  phone: "",
  email: "",
  website: "",
  owner_user_id: null,
  notes: "",
  address: {},
  custom: {},
};

function fromCompany(c: Company): Form {
  return {
    name: c.name,
    legal_name: c.legal_name ?? "",
    cnpj: formatCnpj(c.cnpj),
    domain: c.domain ?? "",
    industry: c.industry ?? "",
    size: c.size ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    website: c.website ?? "",
    owner_user_id: c.owner_user_id,
    notes: c.notes ?? "",
    address: (c.address as Record<string, string>) ?? {},
    custom: (c.custom as Record<string, unknown>) ?? {},
  };
}

// Cadastro de empresa: o CNPJ preenche razão social, setor, porte, telefone e endereço pela Receita.
export function CompanyDialog({ accountId, open, onOpenChange, company, onSaved }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [looking, setLooking] = useState(false);
  const save = useSaveCompany(accountId);
  const team = useTeamMembers(accountId);

  useEffect(() => {
    if (open) setForm(company ? fromCompany(company) : EMPTY);
  }, [open, company]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function fetchCnpj() {
    if (!isValidCnpj(form.cnpj)) {
      toast.error("CNPJ inválido. Confira os 14 dígitos.");
      return;
    }
    setLooking(true);
    try {
      const d = await lookupCnpj(form.cnpj);
      setForm((f) => ({
        ...f,
        name: f.name || d.name,
        legal_name: d.legal_name,
        industry: f.industry || (d.industry ?? ""),
        size: f.size || (d.size ?? ""),
        phone: f.phone || (d.phone ?? ""),
        email: f.email || (d.email ?? ""),
        address: { ...d.address, ...f.address },
      }));
      toast.success("Dados da Receita preenchidos");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLooking(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    const cnpj = onlyDigits(form.cnpj);
    if (cnpj && !isValidCnpj(cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }
    try {
      const row = await save.mutateAsync({
        ...(company ? { id: company.id } : {}),
        values: {
          name: form.name.trim(),
          legal_name: form.legal_name.trim() || null,
          cnpj: cnpj || null,
          domain:
            form.domain
              .trim()
              .toLowerCase()
              .replace(/^https?:\/\//, "")
              .replace(/\/.*$/, "") || null,
          industry: form.industry.trim() || null,
          size: form.size || null,
          phone: onlyDigits(form.phone) || null,
          email: form.email.trim().toLowerCase() || null,
          website: form.website.trim() || null,
          owner_user_id: form.owner_user_id,
          notes: form.notes.trim() || null,
          address: form.address,
          custom: form.custom as never,
        },
      });
      toast.success(company ? "Empresa atualizada" : "Empresa cadastrada");
      onSaved?.(row);
      onOpenChange(false);
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(msg.includes("companies_cnpj") ? "Já existe uma empresa com este CNPJ" : msg);
    }
  }

  const addr = form.address;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{company ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            <DialogDescription>
              Comece pelo CNPJ: buscamos razão social, setor, porte e endereço na Receita.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="co-cnpj">CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  id="co-cnpj"
                  value={form.cnpj}
                  onChange={(e) => set("cnpj", e.target.value)}
                  onBlur={() => set("cnpj", formatCnpj(form.cnpj))}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchCnpj()}
                  disabled={looking || onlyDigits(form.cnpj).length !== 14}
                >
                  {looking ? <Loader2 className="animate-spin" /> : <Search />} Buscar na Receita
                </Button>
              </div>
            </div>
            <Field
              id="co-name"
              label="Nome (como o mercado conhece)"
              value={form.name}
              onChange={(v) => set("name", v)}
              required
            />
            <Field
              id="co-legal"
              label="Razão social"
              value={form.legal_name}
              onChange={(v) => set("legal_name", v)}
            />
            <Field
              id="co-domain"
              label="Domínio do site"
              value={form.domain}
              onChange={(v) => set("domain", v)}
              placeholder="empresa.com.br"
            />
            <Field
              id="co-industry"
              label="Setor"
              value={form.industry}
              onChange={(v) => set("industry", v)}
            />
            <div className="grid gap-1.5">
              <Label>Porte</Label>
              <Select
                value={form.size || "none"}
                onValueChange={(v) => set("size", v === "none" ? "" : v)}
              >
                <SelectTrigger aria-label="Porte">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {Object.entries(SIZE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável</Label>
              <OwnerSelect
                members={team.data ?? []}
                value={form.owner_user_id}
                onChange={(v) => set("owner_user_id", v)}
                aria-label="Responsável"
              />
            </div>
            <Field
              id="co-phone"
              label="Telefone"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              inputMode="tel"
            />
            <Field
              id="co-email"
              label="E-mail"
              value={form.email}
              onChange={(v) => set("email", v)}
              type="email"
            />
            <Field
              id="co-city"
              label="Cidade"
              value={addr["city"] ?? ""}
              onChange={(v) => set("address", { ...addr, city: v })}
            />
            <Field
              id="co-state"
              label="UF"
              value={addr["state"] ?? ""}
              onChange={(v) => set("address", { ...addr, state: v.toUpperCase().slice(0, 2) })}
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="co-notes">Observações</Label>
              <Textarea
                id="co-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <CustomFieldsEditor
                accountId={accountId}
                entity="company"
                values={form.custom}
                onChange={(v) => set("custom", v)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}{" "}
              {company ? "Salvar" : "Cadastrar empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: "tel" | "numeric" | "email";
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}
