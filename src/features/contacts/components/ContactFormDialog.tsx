import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
import { errorMessage } from "@/lib/functions";

import { useCreateContact, useUpdateContact } from "../api";
import { normalizePhone, onlyDigits, type ContactRow } from "../types";
import { TagEditor } from "./TagEditor";

const schema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(160, "Nome muito longo"),
    phone: z
      .string()
      .trim()
      .refine((v) => !v || onlyDigits(v).length >= 8, "Telefone com DDD, só números"),
    email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]),
    company: z.string().trim().max(160),
    job_title: z.string().trim().max(120),
    city: z.string().trim().max(120),
    tags: z.array(z.string()),
  })
  .refine((v) => v.phone || v.email || v.name, {
    message: "Informe ao menos um contato",
    path: ["phone"],
  });

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: "",
  phone: "",
  email: "",
  company: "",
  job_title: "",
  city: "",
  tags: [],
};

function fromContact(c: ContactRow | null | undefined): FormValues {
  if (!c) return EMPTY;
  return {
    name: c.name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    company: c.company ?? "",
    job_title: c.job_title ?? "",
    city: c.city ?? "",
    tags: c.tags,
  };
}

type Props = {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactRow | null | undefined;
  onCreated?: ((id: string) => void) | undefined;
};

const FIELDS: Array<{
  key: Exclude<keyof FormValues, "tags">;
  label: string;
  type?: string;
  auto?: string;
}> = [
  { key: "name", label: "Nome", auto: "name" },
  { key: "phone", label: "Telefone", type: "tel", auto: "tel" },
  { key: "email", label: "E-mail", type: "email", auto: "email" },
  { key: "company", label: "Empresa", auto: "organization" },
  { key: "job_title", label: "Cargo", auto: "organization-title" },
  { key: "city", label: "Cidade", auto: "address-level2" },
];

export function ContactFormDialog({ accountId, open, onOpenChange, contact, onCreated }: Props) {
  const create = useCreateContact(accountId);
  const update = useUpdateContact(accountId);
  const editing = Boolean(contact);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: fromContact(contact),
  });

  useEffect(() => {
    if (open) form.reset(fromContact(contact));
  }, [open, contact, form]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      phone: normalizePhone(values.phone),
      email: values.email ? values.email.toLowerCase() : null,
      company: values.company || null,
      job_title: values.job_title || null,
      city: values.city || null,
      tags: values.tags,
    };
    try {
      if (contact) {
        await update.mutateAsync({ id: contact.id, patch: payload });
        toast.success("Contato atualizado");
      } else {
        const id = await create.mutateAsync({ ...payload, source: "manual" });
        toast.success("Contato criado");
        onCreated?.(id);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const pending = create.isPending || update.isPending;
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Os dados de cadastro aparecem para toda a equipe."
              : "A IA classifica quando ele mandar a primeira mensagem."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-3 sm:grid-cols-2"
          noValidate
        >
          {FIELDS.map((f) => (
            <div
              key={f.key}
              className={f.key === "name" ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}
            >
              <Label htmlFor={`contact-${f.key}`}>{f.label}</Label>
              <Input
                id={`contact-${f.key}`}
                type={f.type ?? "text"}
                autoComplete={f.auto}
                aria-invalid={Boolean(errors[f.key])}
                {...form.register(f.key)}
              />
              {errors[f.key] && <p className="text-[12px] text-danger">{errors[f.key]?.message}</p>}
            </div>
          ))}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Tags</Label>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => <TagEditor tags={field.value} onChange={field.onChange} />}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? "Salvar" : "Criar contato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
