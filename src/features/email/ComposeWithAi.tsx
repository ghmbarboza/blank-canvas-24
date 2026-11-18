// "Escrever com IA": a pessoa diz sobre o que é o e-mail e a IA propõe assunto, prévia e blocos.
// Cai no editor para revisar; nada é enviado daqui.
import { useState, type FormEvent } from "react";
import { Loader2, PenLine } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/functions";

import { emailApi } from "./api";
import type { EmailBlock } from "./render";

type Result = { subject: string; preheader: string; blocks: EmailBlock[] };
type Props = { accountId: string; hasContent: boolean; onDone: (r: Result) => void };

const TONES = [
  { id: "próximo", label: "Próximo" },
  { id: "direto", label: "Direto" },
  { id: "animado", label: "Animado" },
  { id: "formal", label: "Formal" },
];

export function ComposeWithAi({ accountId, hasContent, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("próximo");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (brief.trim().length < 8) return;
    setBusy(true);
    try {
      const r = await emailApi<Result>(accountId, "compose", { brief, tone, link });
      onDone(r);
      setOpen(false);
      toast.success("E-mail escrito. Revise o texto antes de enviar.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <PenLine aria-hidden /> Escrever com IA
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-lg rounded-xl bg-surface">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Escrever com IA</DialogTitle>
              <DialogDescription>
                Diga o objetivo e para quem é. A IA usa o seu catálogo e a base de conhecimento, e
                {hasContent ? " troca o conteúdo atual" : " monta o e-mail"} para você revisar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="ai-brief">Sobre o que é o e-mail</Label>
              <Textarea
                id="ai-brief"
                rows={4}
                value={brief}
                maxLength={2000}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Ex.: convidar quem não volta há 6 meses para a limpeza de novembro, com 10% para quem agendar até dia 20"
                autoFocus
              />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-[13px] font-medium">Tom</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tom do e-mail">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tone === t.id}
                    onClick={() => setTone(t.id)}
                    className={
                      tone === t.id
                        ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-[13px] text-background"
                        : "rounded-full border border-border px-3 py-1 text-[13px] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="ai-link">Link do botão (opcional)</Label>
              <Input
                id="ai-link"
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || brief.trim().length < 8}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}
                {busy ? "Escrevendo…" : "Escrever"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
