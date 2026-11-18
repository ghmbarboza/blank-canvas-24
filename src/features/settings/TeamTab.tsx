import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { initials } from "@/lib/format";
import { useTeamMembers, useUpdateMembership, type TeamMember } from "./api";
import { InviteDialog } from "./InviteDialog";
import { PendingInvites } from "./PendingInvites";
import { ASSIGNABLE_ROLES, ROLE_INFO, isAssignableRole } from "./roles";
import { SettingsCard } from "./SettingsCard";

function MemberRow({
  member,
  editable,
  onUpdate,
  pending,
}: {
  member: TeamMember;
  editable: boolean;
  pending: boolean;
  onUpdate: (patch: { role?: TeamMember["role"]; isActive?: boolean }) => void;
}) {
  const info = ROLE_INFO[member.role];
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted-foreground"
        aria-hidden
      >
        {initials(member.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={
            member.isActive
              ? "truncate text-[14px] font-medium"
              : "truncate text-[14px] font-medium text-subtle line-through"
          }
        >
          {member.name}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">{info.description}</p>
      </div>
      {pending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />
      )}
      {member.role === "owner" || !editable ? (
        <span className="rounded-md bg-surface-2 px-2 py-1 text-[12px] font-medium">
          {info.label}
        </span>
      ) : (
        <Select
          value={member.role}
          onValueChange={(v) => isAssignableRole(v) && onUpdate({ role: v })}
        >
          <SelectTrigger className="h-8 w-40" aria-label={`Papel de ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_INFO[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Switch
          checked={member.isActive}
          disabled={!editable || member.role === "owner"}
          onCheckedChange={(v) => onUpdate({ isActive: v })}
          aria-label={`${member.name} ativo`}
        />
        <span className="w-12">{member.isActive ? "Ativo" : "Inativo"}</span>
      </label>
    </li>
  );
}

export function TeamTab() {
  const { current, isAdmin } = useAccount();
  const { user } = useAuth();
  const accountId = current?.accountId ?? "";
  const team = useTeamMembers(accountId);
  const update = useUpdateMembership(accountId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  function onUpdate(member: TeamMember, patch: { role?: TeamMember["role"]; isActive?: boolean }) {
    setSavingId(member.userId);
    update.mutate(
      { userId: member.userId, ...patch },
      {
        onSuccess: () =>
          toast.success(
            patch.role
              ? `${member.name} agora é ${ROLE_INFO[patch.role].label.toLowerCase()}`
              : patch.isActive
                ? `${member.name} reativado`
                : `${member.name} desativado`,
          ),
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setSavingId(null),
      },
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Equipe"
        description="Quem acessa a conta e o que cada um vê. Inativo perde o acesso, mas o histórico fica."
        readOnlyNote={
          isAdmin ? undefined : "Só donos e administradores mudam papéis e convidam pessoas."
        }
        actions={
          isAdmin && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden /> Convidar pessoa
            </Button>
          )
        }
      >
        {team.isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        )}
        {team.isError && <p className="text-[13px] text-danger">{errorMessage(team.error)}</p>}
        {team.data && (
          <ul className="divide-y divide-border">
            {team.data.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                editable={isAdmin && m.userId !== user?.id}
                pending={savingId === m.userId}
                onUpdate={(patch) => onUpdate(m, patch)}
              />
            ))}
          </ul>
        )}
      </SettingsCard>
      {isAdmin && <PendingInvites accountId={accountId} />}
      {isAdmin && (
        <InviteDialog accountId={accountId} open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
    </div>
  );
}
