import { useDeferredValue, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { ContactAvatar } from "@/components/common/ContactAvatar";
import { TempChip } from "@/components/common/TempChip";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { enabledModules } from "./modules";
import { navItemsFor } from "./nav";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function CommandMenu({ open, onOpenChange }: Props) {
  const { current, isManager } = useAccount();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());

  const { data: contacts } = useQuery({
    queryKey: ["command-contacts", current?.accountId, term],
    enabled: open && term.length >= 2 && Boolean(current),
    queryFn: async () => {
      // Escapa os curingas do PostgREST antes de montar o filtro.
      const safe = term.replace(/[%*,()]/g, " ");
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone, email, company, temperature, score, source, avatar_url")
        .eq("account_id", current!.accountId)
        .or(
          `name.ilike.*${safe}*,phone.ilike.*${safe}*,email.ilike.*${safe}*,company.ilike.*${safe}*`,
        )
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(8);
      return data ?? [];
    },
  });

  function go(fn: () => void) {
    onOpenChange(false);
    setSearch("");
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar contato, empresa, telefone ou ir para…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          Nada com esse nome. Tente o nome do contato, do negócio ou da tela.
        </CommandEmpty>
        {!!contacts?.length && (
          <CommandGroup heading="Contatos">
            {contacts.map((c) => (
              <CommandItem
                key={c.id}
                value={`contato ${c.id} ${c.name ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`}
                onSelect={() =>
                  go(() => navigate({ to: "/contatos/$contactId", params: { contactId: c.id } }))
                }
                className="gap-3"
              >
                <ContactAvatar name={c.name} src={c.avatar_url} platform={c.source} size={28} />
                <span className="min-w-0 flex-1 truncate">
                  {c.name ?? c.phone ?? "Sem nome"}
                  {c.company && <span className="text-muted-foreground"> · {c.company}</span>}
                </span>
                <TempChip level={c.temperature} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Ir para">
          {navItemsFor(isManager, enabledModules(current?.settings)).map((item) => (
            <CommandItem
              key={item.to}
              value={item.label}
              onSelect={() => go(() => navigate({ to: item.to }))}
            >
              <item.icon /> {item.label}
              <CommandShortcut>{item.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
