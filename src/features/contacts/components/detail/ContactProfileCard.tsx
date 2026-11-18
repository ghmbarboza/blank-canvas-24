import { toast } from "sonner";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/functions";
import { formatPhone } from "@/lib/format";

import { useContactIdentities, useTeamMembers, useUpdateContact } from "../../api";
import {
  LIFECYCLES,
  LIFECYCLE_LABEL,
  isLifecycle,
  normalizePhone,
  onlyDigits,
  type ContactRow,
} from "../../types";
import { OwnerSelect } from "../OwnerSelect";
import { TagEditor } from "../TagEditor";
import { InlineField } from "./InlineField";

type Props = { accountId: string; contact: ContactRow };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function SectionTitle({ children, id }: { children: string; id: string }) {
  return (
    <h2 id={id} className="mb-2 text-[11px] font-medium tracking-widest text-subtle uppercase">
      {children}
    </h2>
  );
}

export function ContactProfileCard({ accountId, contact }: Props) {
  const update = useUpdateContact(accountId);
  const team = useTeamMembers(accountId);
  const identities = useContactIdentities(accountId, contact.id);

  async function save(patch: TablesUpdate<"contacts">, okMessage = "Salvo") {
    try {
      await update.mutateAsync({ id: contact.id, patch });
      toast.success(okMessage);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  const text = (key: "name" | "company" | "job_title" | "city") => (v: string) =>
    save({ [key]: v || null });

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="profile-heading"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <SectionTitle id="profile-heading">Cadastro</SectionTitle>
        <dl>
          <InlineField label="Nome" value={contact.name} onSave={text("name")} />
          <InlineField
            label="Telefone"
            type="tel"
            value={contact.phone}
            display={formatPhone(contact.phone)}
            validate={(v) => (v && onlyDigits(v).length < 8 ? "Telefone com DDD" : null)}
            onSave={(v) => save({ phone: normalizePhone(v) })}
          />
          <InlineField
            label="E-mail"
            type="email"
            value={contact.email}
            validate={(v) => (v && !EMAIL_RE.test(v) ? "E-mail inválido" : null)}
            onSave={(v) => save({ email: v ? v.toLowerCase() : null })}
          />
          <InlineField label="Empresa" value={contact.company} onSave={text("company")} />
          <InlineField label="Cargo" value={contact.job_title} onSave={text("job_title")} />
          <InlineField label="Cidade" value={contact.city} onSave={text("city")} />
        </dl>
      </section>

      <section
        aria-labelledby="owner-heading"
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
      >
        <div>
          <SectionTitle id="owner-heading">Responsável</SectionTitle>
          <OwnerSelect
            members={team.data ?? []}
            value={contact.owner_user_id}
            onChange={(id) =>
              void save({ owner_user_id: id }, "Responsável atualizado").catch(() => undefined)
            }
            disabled={update.isPending}
          />
        </div>
        <div>
          <label htmlFor="contact-lifecycle" className="mb-1.5 block text-[12px] text-subtle">
            Ciclo
          </label>
          <Select
            value={isLifecycle(contact.lifecycle) ? contact.lifecycle : "lead"}
            onValueChange={(v) =>
              void save({ lifecycle: v }, "Ciclo atualizado").catch(() => undefined)
            }
          >
            <SelectTrigger id="contact-lifecycle" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LIFECYCLE_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1.5 text-[12px] text-subtle">Tags</p>
          <TagEditor
            tags={contact.tags}
            onChange={(tags) => void save({ tags }, "Tags atualizadas").catch(() => undefined)}
            disabled={update.isPending}
          />
        </div>
      </section>

      <section
        aria-labelledby="identities-heading"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <SectionTitle id="identities-heading">Onde fala com você</SectionTitle>
        {identities.isError ? (
          <p className="text-[12px] text-danger">Não deu para carregar as identidades.</p>
        ) : identities.data?.length ? (
          <ul className="space-y-1.5">
            {identities.data.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-[13px]">
                <ChannelIcon platform={i.platform} size={16} />
                <span className="truncate">
                  {i.platform === "whatsapp" || i.platform === "sms"
                    ? formatPhone(i.handle)
                    : i.handle}
                </span>
                <span className="ml-auto text-[11px] text-subtle">
                  {PLATFORM_LABEL[i.platform] ?? i.platform}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-subtle">
            Nenhuma rede vinculada ainda. Quando a pessoa mandar mensagem por um canal, a identidade
            aparece aqui.
          </p>
        )}
      </section>
    </div>
  );
}
