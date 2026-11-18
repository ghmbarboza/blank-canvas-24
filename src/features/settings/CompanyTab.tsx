import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { useUpdateAccount } from "./api";
import { TIMEZONES } from "./roles";
import { SettingsCard } from "./SettingsCard";

export function CompanyTab() {
  const { current, isAdmin } = useAccount();
  const update = useUpdateAccount(current?.accountId ?? "");
  const [name, setName] = useState(current?.accountName ?? "");
  const [timezone, setTimezone] = useState(current?.timezone ?? "America/Sao_Paulo");

  useEffect(() => {
    setName(current?.accountName ?? "");
    setTimezone(current?.timezone ?? "America/Sao_Paulo");
  }, [current?.accountName, current?.timezone]);

  const trimmed = name.trim();
  const dirty = trimmed !== current?.accountName || timezone !== current?.timezone;
  const valid = trimmed.length >= 2 && trimmed.length <= 120;
  const knownZone = TIMEZONES.some((t) => t.value === timezone);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast.error("O nome precisa ter entre 2 e 120 letras");
      return;
    }
    update.mutate(
      { name: trimmed, timezone },
      {
        onSuccess: () => toast.success("Dados da empresa salvos"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <SettingsCard
      title="Empresa"
      description="O fuso horário define a agenda, os relatórios e os horários das mensagens."
      readOnlyNote={isAdmin ? undefined : "Só donos e administradores alteram estes dados."}
    >
      <form onSubmit={submit} className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="company-name">Nome da empresa</Label>
          <Input
            id="company-name"
            value={name}
            maxLength={120}
            disabled={!isAdmin}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-tz">Fuso horário</Label>
          <Select value={timezone} onValueChange={setTimezone} disabled={!isAdmin}>
            <SelectTrigger id="company-tz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!knownZone && <SelectItem value={timezone}>{timezone}</SelectItem>}
              {TIMEZONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isAdmin && (
          <Button type="submit" disabled={!dirty || !valid || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar
          </Button>
        )}
      </form>
    </SettingsCard>
  );
}
