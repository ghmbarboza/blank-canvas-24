import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TeamMember } from "@/features/settings/api";

const NONE = "__none";

interface Props {
  id: string;
  members: TeamMember[];
  value: string | null;
  onChange: (userId: string | null) => void;
}

export function OwnerSelect({ id, members, value, onChange }: Props) {
  const active = members.filter((m) => m.isActive);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Atendente dono (opcional)</Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Ninguém, é da equipe</SelectItem>
          {active.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
