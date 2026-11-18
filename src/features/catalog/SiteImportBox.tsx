// "Tem site ou loja online? Cole o endereço": lê o site, mostra a prévia e grava o que o dono
// confirmar. Sem chave de terceiro: a leitura é feita pelo próprio servidor da central.
import { useId, useState, type FormEvent } from "react";
import { Globe, Loader2 } from "lucide-react";

import type { ConfirmResult, SitePreview } from "@/backend/setup-agent/site-import/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { usePreviewSite } from "./site-import-api";
import { SiteImportPreview } from "./SiteImportPreview";

interface Props {
  accountId: string;
  label?: string;
  hint?: string;
  /** preencher também o passo "Sua empresa" (só campos vazios) */
  fillCompany?: boolean;
  /** a leitura terminou: quem chama pode aproveitar os dados (preencher o formulário, por exemplo) */
  onPreview?: (preview: SitePreview) => void;
  onDone?: (result: ConfirmResult) => void;
  className?: string;
}

export function SiteImportBox({
  accountId,
  label = "Tem site ou loja online? Cole o endereço",
  hint = "Eu leio o site e trago o que vocês vendem. Você confere antes de gravar.",
  fillCompany = false,
  onPreview,
  onDone,
  className,
}: Props) {
  const uid = useId();
  const read = usePreviewSite(accountId);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<SitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const value = url.trim();
    if (value.length < 4) return setError("Cole o endereço do site, por exemplo minhaloja.com.br");
    setError(null);
    setPreview(null);
    read.mutate(value, {
      onSuccess: (p) => {
        setPreview(p);
        onPreview?.(p);
      },
      onError: (err) => setError(errorMessage(err)),
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <form onSubmit={submit} className="space-y-1.5" noValidate>
        <Label htmlFor={`${uid}-url`}>{label}</Label>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Globe
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={`${uid}-url`}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              className="pl-9"
              placeholder="minhaloja.com.br"
              value={url}
              aria-describedby={`${uid}-hint`}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="h-10" disabled={read.isPending}>
            {read.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {read.isPending ? "Lendo o site…" : "Ler o site"}
          </Button>
        </div>
        <p id={`${uid}-hint`} className="text-[12px] text-muted-foreground">
          {read.isPending ? "Isso leva de 5 a 40 segundos, conforme o tamanho do site." : hint}
        </p>
      </form>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-hot-line bg-hot-soft px-3 py-2.5 text-[13px] text-hot-fg"
        >
          {error}
        </p>
      ) : null}
      {preview ? (
        <SiteImportPreview
          accountId={accountId}
          preview={preview}
          fillCompany={fillCompany}
          onDone={(r) => onDone?.(r)}
        />
      ) : null}
    </div>
  );
}
