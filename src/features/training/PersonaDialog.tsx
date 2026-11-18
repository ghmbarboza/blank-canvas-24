import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { usePlaybooks } from "@/features/playbooks/api";
import { errorMessage } from "@/lib/functions";

import { useSavePersona, type Persona } from "./api";
import { DIFFICULTY_LABEL, type Difficulty } from "./roleplay";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  persona: Persona | null;
}

// Cadastro de cliente simulado: quanto mais real o contexto e as objeções, melhor o treino.
export function PersonaDialog({ accountId, open, onOpenChange, persona }: Props) {
  const save = useSavePersona(accountId);
  const playbooks = usePlaybooks(accountId);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [profile, setProfile] = useState("");
  const [objections, setObjections] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [playbookId, setPlaybookId] = useState("none");

  useEffect(() => {
    if (!open) return;
    setName(persona?.name ?? "");
    setRole(persona?.role ?? "");
    setCompany(persona?.company ?? "");
    setProfile(persona?.profile ?? "");
    setObjections((persona?.objections ?? []).join("\n"));
    setDifficulty((persona?.difficulty as Difficulty) ?? "medium");
    setPlaybookId(persona?.playbook_id ?? "none");
  }, [open, persona]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome ao cliente");
      return;
    }
    try {
      await save.mutateAsync({
        ...(persona ? { id: persona.id } : {}),
        name: name.trim(),
        role: role.trim() || null,
        company: company.trim() || null,
        profile: profile.trim(),
        objections: objections
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, 10),
        difficulty,
        playbook_id: playbookId === "none" ? null : playbookId,
      });
      toast.success("Persona salva");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>
              {persona ? "Editar cliente simulado" : "Novo cliente simulado"}
            </DialogTitle>
            <DialogDescription>
              Descreva um cliente típico do seu mercado. A IA vai interpretar este papel.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pr-name">Nome</Label>
              <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-role">Cargo</Label>
              <Input id="pr-role" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pr-company">Empresa e porte</Label>
              <Input
                id="pr-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Ex.: Acme Logística (120 pessoas)"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pr-profile">Contexto e dor</Label>
              <Textarea
                id="pr-profile"
                rows={3}
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pr-obj">Objeções típicas (uma por linha)</Label>
              <Textarea
                id="pr-obj"
                rows={3}
                value={objections}
                onChange={(e) => setObjections(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Dificuldade</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                <SelectTrigger aria-label="Dificuldade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                    <SelectItem key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Playbook</Label>
              <Select value={playbookId} onValueChange={setPlaybookId}>
                <SelectTrigger aria-label="Playbook">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">O padrão da empresa</SelectItem>
                  {(playbooks.data ?? []).map((pb) => (
                    <SelectItem key={pb.row.id} value={pb.row.id}>
                      {pb.content.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
