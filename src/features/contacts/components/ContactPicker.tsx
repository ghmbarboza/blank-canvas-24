import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useContactSearch, type ContactLite } from "../api";
import { useDebounced } from "../useDebounced";

export interface PickedContact {
  id: string;
  name: string | null;
  source: string | null;
  avatarUrl: string | null;
}

type Props = {
  accountId: string;
  value: PickedContact | null;
  onChange: (contact: PickedContact | null) => void;
  id?: string;
};

function toPicked(c: ContactLite): PickedContact {
  return { id: c.id, name: c.name, source: c.source, avatarUrl: c.avatar_url };
}

// Busca no servidor: a lista de contatos pode ter milhares de linhas.
export function ContactPicker({ accountId, value, onChange, id }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term);
  const { data = [], isFetching, isError } = useContactSearch(accountId, debounced, open);

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 flex-1 justify-between px-3 font-normal"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                <ContactAvatar
                  name={value.name}
                  src={value.avatarUrl}
                  platform={value.source}
                  size={20}
                />
                <span className="truncate">{value.name ?? "Sem nome"}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Buscar contato</span>
            )}
            <ChevronsUpDown className="text-subtle" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={term}
              onValueChange={setTerm}
              placeholder="Nome, telefone, e-mail ou empresa"
            />
            <CommandList>
              <CommandEmpty>
                {isError
                  ? "Não deu para buscar agora."
                  : isFetching
                    ? "Buscando…"
                    : "Nenhum contato encontrado."}
              </CommandEmpty>
              <CommandGroup>
                {data.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(toPicked(c));
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <ContactAvatar name={c.name} src={c.avatar_url} platform={c.source} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{c.name ?? "Sem nome"}</span>
                      <span className="block truncate text-[11px] text-subtle">
                        {[c.company, formatPhone(c.phone) || c.email].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Check
                      className={cn("size-4", value?.id === c.id ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          aria-label="Remover contato"
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
