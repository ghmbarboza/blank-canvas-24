import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PLACEHOLDER_COMPANY, SEGMENT_LABELS } from "@/backend/setup-agent/roteiro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useSaveCompany } from "../api";
import type { RoteiroDetail } from "../progress";
import { StepError, type StepProps } from "./ui";

const TONES = [
  "Próximo e simpático",
  "Profissional e direto",
  "Descontraído, com bom humor",
  "Formal e cuidadoso",
];

export function CompanyStep({
  accountId,
  onNext,
  detail,
}: StepProps & { detail: RoteiroDetail | undefined }) {
  const uid = useId();
  const save = useSaveCompany(accountId);
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [sells, setSells] = useState("");
  const [tone, setTone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // o que já está salvo volta para o formulário uma vez (não atropela o que a pessoa digita)
  useEffect(() => {
    if (!detail || loaded) return;
    setLoaded(true);
    setName(detail.company === PLACEHOLDER_COMPANY ? "" : detail.company);
    setSegment(detail.segment ?? "");
    setSells(detail.sells);
    setTone(detail.tone);
  }, [detail, loaded]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2)
      return setError("Escreva o nome da empresa, como o cliente conhece.");
    if (!segment) return setError("Escolha o ramo da empresa (se não achar o seu, use Outro).");
    save.mutate(
      { name: name.trim(), segment, sells: sells.trim(), tone: tone.trim() },
      {
        onSuccess: () => {
          toast.success("Empresa salva");
          onNext();
        },
        onError: (err) => setError(`Não consegui salvar: ${errorMessage(err)}. Tente de novo.`),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-name`}>Nome da empresa</Label>
        <Input
          id={`${uid}-name`}
          value={name}
          maxLength={120}
          autoComplete="organization"
          placeholder="Ex.: Loja Bela Casa"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <fieldset>
        <legend className="text-[14px] font-medium">Ramo</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ramo">
          {SEGMENT_LABELS.map((s) => {
            const on = segment === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSegment(s.id)}
                className={cn(
                  "min-h-11 rounded-xl border px-3 py-2 text-left text-[13px] transition",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on
                    ? "border-primary bg-primary-soft font-medium"
                    : "border-border hover:border-foreground/30",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-sells`}>O que vocês vendem</Label>
        <Textarea
          id={`${uid}-sells`}
          value={sells}
          rows={2}
          maxLength={600}
          placeholder="Ex.: móveis planejados para casa e escritório, com entrega e montagem"
          onChange={(e) => setSells(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-tone`}>Como vocês falam com o cliente</Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tone === t}
              onClick={() => setTone(t)}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1 text-[13px] transition",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                tone === t ? "border-primary bg-primary-soft font-medium" : "border-border",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Input
          id={`${uid}-tone`}
          value={tone}
          maxLength={300}
          placeholder="Ou escreva do seu jeito"
          onChange={(e) => setTone(e.target.value)}
        />
      </div>

      {error ? <StepError>{error}</StepError> : null}

      <Button type="submit" className="h-11" disabled={save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar e continuar
        <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}
