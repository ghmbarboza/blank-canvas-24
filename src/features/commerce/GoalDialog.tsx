import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseMoneyInput } from "@/features/crm/money";
import { errorMessage } from "@/lib/functions";

import { METRIC_LABEL, useSaveGoal } from "./api";

// Define a meta do mês (time inteiro ou uma pessoa).
export function GoalDialog({
  accountId,
  period,
  open,
  onOpenChange,
  members,
}: {
  accountId: string;
  period: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: { userId: string; name: string }[];
}) {
  const save = useSaveGoal(accountId);
  const [metric, setMetric] = useState("revenue");
  const [who, setWho] = useState("team");
  const [target, setTarget] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value =
      metric === "revenue" ? parseMoneyInput(target) : Number(target.replace(/\D/g, ""));
    if (!value || value <= 0) {
      toast.error("Informe um alvo maior que zero");
      return;
    }
    try {
      await save.mutateAsync({
        period,
        metric,
        target: value,
        user_id: who === "team" ? null : who,
      });
      toast.success("Meta definida");
      setTarget("");
      onOpenChange(false);
    } catch (err) {
      const m = errorMessage(err);
      toast.error(
        m.includes("goals_unique")
          ? "Já existe essa meta neste mês. Exclua a antiga para trocar."
          : m,
      );
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Definir meta do mês</DialogTitle>
            <DialogDescription>Vale para o mês selecionado na tela.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label>O que medir</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METRIC_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>De quem</Label>
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Time inteiro</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-target">
                {metric === "revenue" ? "Alvo (R$)" : "Alvo (quantidade)"}
              </Label>
              <Input
                id="goal-target"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar meta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
