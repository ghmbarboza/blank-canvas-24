import { useEffect, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { TempChip } from "@/components/common/TempChip";
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

import { useContactSearch } from "./api";
import type { EventContact } from "./types";

interface Props {
  id: string;
  value: EventContact | null;
  onChange: (contact: EventContact | null) => void;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function ContactPicker({ id, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 250);
  const { data, isFetching, isError } = useContactSearch(debounced);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 flex-1 justify-between px-3 font-normal"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                <ContactAvatar
                  name={value.name}
                  src={value.avatar_url}
                  platform={value.source}
                  size={22}
                />
                <span className="truncate text-foreground">{value.name ?? "Sem nome"}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Buscar contato pelo nome</span>
            )}
            <ChevronsUpDown className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={term} onValueChange={setTerm} placeholder="Nome do contato…" />
            <CommandList>
              <CommandEmpty>
                {isError
                  ? "Não foi possível buscar agora."
                  : isFetching
                    ? "Buscando…"
                    : "Nenhum contato com esse nome."}
              </CommandEmpty>
              <CommandGroup>
                {(data ?? []).map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <ContactAvatar name={c.name} src={c.avatar_url} platform={c.source} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{c.name ?? "Sem nome"}</span>
                      {c.company && (
                        <span className="block truncate text-[11px] text-subtle">{c.company}</span>
                      )}
                    </span>
                    <TempChip level={c.temperature} />
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
          aria-label="Remover contato"
          onClick={() => onChange(null)}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
