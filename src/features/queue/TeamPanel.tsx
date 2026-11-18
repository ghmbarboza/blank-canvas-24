import { hasChannel } from "@/lib/edition";
import { useState } from "react";
import { Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";

import { useCallCenterTeam, useSaveAgent, useSetSkill, type TeamRow } from "./api";
import { DEFAULT_CAPACITY, normalizeSkill } from "./lib";

const LEVEL_LABEL: Record<number, string> = {
  1: "aprendendo",
  2: "básico",
  3: "bom",
  4: "muito bom",
  5: "especialista",
};

function CapSelect({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      {label}
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-8 w-16" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: max + 1 }, (_, i) => (
            <SelectItem key={i} value={String(i)}>
              {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function MemberRow({ row, accountId }: { row: TeamRow; accountId: string }) {
  const save = useSaveAgent(accountId);
  const setSkill = useSetSkill(accountId);
  const [skill, setSkillText] = useState("");
  const [level, setLevel] = useState("3");
  const on = Boolean(row.agent?.is_active);
  const cap = row.agent ?? { ...DEFAULT_CAPACITY, wrap_up_seconds: 60 };
  const onErr = (e: unknown) => toast.error(errorMessage(e));
  const patch = (p: Parameters<typeof save.mutate>[0]["patch"]) =>
    save.mutate({ userId: row.userId, patch: { is_active: on, ...p } }, { onError: onErr });

  const addSkill = () => {
    const s = normalizeSkill(skill);
    if (!s) return;
    setSkill.mutate(
      { userId: row.userId, skill: s, level: Number(level) },
      {
        onSuccess: () => {
          setSkillText("");
          if (!on) patch({ is_active: true });
        },
        onError: onErr,
      },
    );
  };

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{row.name}</p>
          {hasChannel("phone") && (
            <p className="text-[12px] text-muted-foreground">
              {row.extension
                ? `ramal ${row.extension}`
                : "sem ramal (não recebe ligação pela Zadarma)"}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={on}
            onCheckedChange={(v) =>
              save.mutate(
                { userId: row.userId, patch: { is_active: v } },
                {
                  onSuccess: () =>
                    toast.success(
                      v ? `${row.name} entrou na equipe` : `${row.name} saiu da equipe`,
                    ),
                  onError: onErr,
                },
              )
            }
            aria-label={`${row.name} atende na fila`}
          />
          Atende na fila
        </label>
      </div>
      {on && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[12px] font-medium">Ao mesmo tempo:</span>
            {hasChannel("phone") && (
              <CapSelect
                label="ligações"
                value={cap.cap_voice}
                max={3}
                onChange={(v) => patch({ cap_voice: v })}
              />
            )}
            <CapSelect
              label="conversas"
              value={cap.cap_chat}
              max={12}
              onChange={(v) => patch({ cap_chat: v })}
            />
            {hasChannel("email") && (
              <CapSelect
                label="e-mails"
                value={cap.cap_email}
                max={20}
                onChange={(v) => patch({ cap_email: v })}
              />
            )}
            <CapSelect
              label="chamados"
              value={cap.cap_task}
              max={20}
              onChange={(v) => patch({ cap_task: v })}
            />
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              pós-atendimento
              <Input
                type="number"
                min={0}
                max={1800}
                className="h-8 w-20"
                defaultValue={cap.wrap_up_seconds}
                onBlur={(e) => {
                  const v = Math.min(1800, Math.max(0, Number(e.target.value) || 0));
                  if (v !== cap.wrap_up_seconds) patch({ wrap_up_seconds: v });
                }}
                aria-label="Segundos de pós-atendimento"
              />
              s
            </label>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium">Habilidades</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {row.skills.length === 0 && (
                <span className="text-[12px] text-subtle">
                  Nenhuma: só recebe atendimento que não pede habilidade.
                </span>
              )}
              {row.skills.map((s) => (
                <span
                  key={s.skill}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium"
                >
                  {s.skill} · {LEVEL_LABEL[s.level] ?? s.level}
                  <button
                    type="button"
                    aria-label={`Tirar ${s.skill}`}
                    className="rounded-full p-0.5 hover:bg-surface-3"
                    onClick={() =>
                      setSkill.mutate(
                        { userId: row.userId, skill: s.skill, level: null },
                        { onError: onErr },
                      )
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="mt-2 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addSkill();
              }}
            >
              <Input
                value={skill}
                onChange={(e) => setSkillText(e.target.value)}
                placeholder="Ex.: suporte, cobrança, renovação, inglês"
                className="h-8 w-56"
                maxLength={40}
                aria-label="Nova habilidade"
              />
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="h-8 w-36" aria-label="Nível">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      {l} · {LEVEL_LABEL[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={!skill.trim()}
              >
                <Plus className="size-4" /> Adicionar
              </Button>
            </form>
          </div>
        </div>
      )}
    </li>
  );
}

/** Equipe de atendimento: quem atende, quanto aguenta por canal e o que sabe fazer. */
export function TeamPanel({ accountId }: { accountId: string }) {
  const team = useCallCenterTeam(accountId);
  if (team.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (team.isError) return <p className="text-[13px] text-danger">{errorMessage(team.error)}</p>;
  if (!team.data?.length)
    return (
      <EmptyState
        icon={Users}
        title="Ninguém na conta ainda"
        description="Convide as pessoas em Ajustes › Equipe e volte aqui para dizer quem atende."
      />
    );
  return (
    <ul className="space-y-3">
      {team.data.map((r) => (
        <MemberRow key={r.userId} row={r} accountId={accountId} />
      ))}
    </ul>
  );
}
