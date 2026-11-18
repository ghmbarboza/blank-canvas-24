import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { TeamMember } from "../types";
import { OwnerAvatar } from "./OwnerAvatar";

const NONE = "__none__";

type Props = {
  members: TeamMember[];
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

export function OwnerSelect({
  members,
  value,
  onChange,
  disabled = false,
  className,
  id,
  ...rest
}: Props) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={cn("h-9", className)}
        aria-label={rest["aria-label"] ?? "Responsável"}
      >
        <SelectValue placeholder="Sem responsável" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem responsável</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.userId} value={m.userId}>
            <span className="flex items-center gap-2">
              <OwnerAvatar member={m} size={18} />
              {m.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
