import { Mail, Phone } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { ContactAvatar } from "@/components/common/ContactAvatar";
import { OriginChip } from "@/components/common/OriginChip";
import { describeOrigin, type TouchLike } from "@/features/contacts/origin";
import { formatPhone } from "@/lib/format";
import { useContactIdentities } from "../api";
import { platformLabel } from "../lib/channel";
import type { Contact } from "../types";

export function ContactCard({ accountId, contact }: { accountId: string; contact: Contact }) {
  const identities = useContactIdentities(accountId, contact.id);
  const name = contact.name || formatPhone(contact.phone) || "Contato sem nome";
  const role = [contact.job_title, contact.company].filter(Boolean).join(" · ");
  const first = contact.first_touch as TouchLike | null;
  const last = contact.last_touch as TouchLike | null;
  // último toque diferente do primeiro: a pessoa voltou por outro anúncio ou campanha
  const cameBack =
    describeOrigin(last)?.short !== describeOrigin(first)?.short && Boolean(describeOrigin(last));

  return (
    <div className="flex flex-col items-center px-5 pt-8 pb-6 text-center">
      <ContactAvatar name={name} src={contact.avatar_url} size={80} />
      <h2 className="mt-4 font-display text-xl font-medium text-foreground">{name}</h2>
      {role && <p className="mt-0.5 text-[13px] text-muted-foreground">{role}</p>}
      <OriginChip touch={first} size="md" className="mt-3" />
      {cameBack ? (
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1 text-[12px] text-muted-foreground">
          Voltou por <OriginChip touch={last} />
        </p>
      ) : null}

      <dl className="mt-4 w-full space-y-1.5 text-left text-[13px]">
        {contact.phone && (
          <div className="flex items-center gap-2.5">
            <dt className="sr-only">Telefone</dt>
            <Phone className="size-3.5 shrink-0 text-subtle" aria-hidden />
            <dd>
              <a
                href={`tel:+${contact.phone.replace(/\D/g, "")}`}
                className="tabular-nums hover:text-primary hover:underline"
              >
                {formatPhone(contact.phone)}
              </a>
            </dd>
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-2.5">
            <dt className="sr-only">E-mail</dt>
            <Mail className="size-3.5 shrink-0 text-subtle" aria-hidden />
            <dd className="min-w-0 truncate">
              <a href={`mailto:${contact.email}`} className="hover:text-primary hover:underline">
                {contact.email}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {(identities.data?.length ?? 0) > 0 && (
        <ul className="mt-4 flex w-full flex-wrap gap-1.5" aria-label="Perfis nas redes">
          {identities.data?.map((i) => (
            <li
              key={i.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[12px]"
              title={`${platformLabel(i.platform)}: ${i.handle}`}
            >
              <ChannelIcon platform={i.platform} size={13} />
              <span className="truncate">
                {i.display_name || (i.platform === "whatsapp" ? formatPhone(i.handle) : i.handle)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
