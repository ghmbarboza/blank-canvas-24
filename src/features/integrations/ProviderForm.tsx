import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleHelp, ExternalLink, KeyRound, Loader2, RefreshCw } from "lucide-react";
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
import { CopyField } from "@/features/channels/CopyField";
import { GUIA_DO_PROVEDOR } from "@/features/help/content";
import { useForms } from "@/features/forms/api";
import { errorMessage } from "@/lib/functions";

import { useSaveIntegration, useTestIntegration, type ProviderState } from "./api";
import { GUIDES, guideUrl, newWebhookToken } from "./guides";
import type { ProviderDef } from "./providers";

interface Props {
  accountId: string;
  def: ProviderDef;
  state: ProviderState | undefined;
  /** Chamado depois de salvar (e testar, quando dá). */
  onSaved?: () => void;
  /** Esconde a frase "para que serve" quando quem envolve já a mostrou. */
  hideWhat?: boolean;
}

// Roteiro + endereços prontos + campos. Tokens de webhook saem gerados: a pessoa só copia.
export function ProviderForm({ accountId, def, state, onSaved, hideWhat }: Props) {
  const guide = GUIDES[def.id];
  const save = useSaveIntegration(accountId);
  const test = useTestIntegration(accountId);
  const auto = useMemo(() => new Set(guide?.autoFields ?? []), [guide]);
  // gerados uma vez por formulário montado: atualizar os dados não troca o código já copiado
  const [tokens] = useState(() =>
    Object.fromEntries([...(guide?.autoFields ?? [])].map((k) => [k, newWebhookToken()])),
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const needsForm = Boolean(guide?.urls?.some((u) => u.template.includes("{form}")));
  const [formId, setFormId] = useState<string>("");

  useEffect(() => {
    const plain = def.fields
      .filter((f) => !f.secret)
      .map((f) => [f.key, state?.config[f.key] ?? ""] as const);
    const pending = Object.entries(tokens).filter(([k]) => !state?.secrets[k]);
    setValues(Object.fromEntries([...plain, ...pending]));
  }, [def, state, tokens]);

  const base = typeof window !== "undefined" ? window.location.origin : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ provider: def.id, values });
      if (def.testable) {
        const r = await test.mutateAsync(def.id);
        toast.success(r.message);
      } else toast.success("Salvo. Esta integração confere os dados na primeira conexão.");
      onSaved?.();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      {guide ? (
        <section aria-label={`Como conseguir os dados do ${def.name}`} className="grid gap-3">
          {hideWhat ? null : (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{guide.what}</p>
          )}
          <ol className="grid gap-2">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] font-semibold text-muted-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={guide.signupUrl} target="_blank" rel="noopener noreferrer">
                Abrir o {def.name} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
            {guide.keysUrl ? (
              <Button asChild size="sm" variant="ghost">
                <a href={guide.keysUrl} target="_blank" rel="noopener noreferrer">
                  <KeyRound className="size-3.5" aria-hidden /> Página das chaves
                </a>
              </Button>
            ) : null}
            {GUIA_DO_PROVEDOR[def.id] ? (
              <Button asChild size="sm" variant="ghost">
                <Link to="/central-de-ajuda/$slug" params={{ slug: GUIA_DO_PROVEDOR[def.id]! }}>
                  <CircleHelp className="size-3.5" aria-hidden /> Como pegar esta chave
                </Link>
              </Button>
            ) : null}
            <span className="text-[12px] text-subtle">{guide.cost}</span>
          </div>
          <p className="text-[12px] text-subtle">
            Se o navegador oferecer tradução, mantenha esta página em português original: a tradução
            automática pode trocar letras da chave colada.
          </p>
        </section>
      ) : null}

      {needsForm ? (
        <FormChooser
          accountId={accountId}
          id={`int-form-${def.id}`}
          value={formId}
          onChange={setFormId}
        />
      ) : null}

      {guide?.urls?.map((u) => {
        const { url, missing } = guideUrl(u.template, {
          base,
          account: accountId,
          form: formId,
          values,
        });
        return missing.length ? null : <CopyField key={u.label} label={u.label} value={url} />;
      })}

      <form onSubmit={(e) => void submit(e)} className="grid gap-4">
        {def.fields.map((f) => {
          const isAuto = auto.has(f.key);
          const saved = Boolean(f.secret && state?.secrets[f.key]);
          if (isAuto && !saved)
            return (
              <div key={f.key} className="grid gap-1.5">
                <CopyField label={f.label} value={values[f.key] ?? ""} />
                <p className="text-[11px] text-subtle">
                  Gerado pelo Nexus. Copie para o painel do {def.name}; ele fica guardado no cofre
                  quando você salvar.
                </p>
              </div>
            );
          return (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={`int-${def.id}-${f.key}`}>
                {f.label}
                {f.optional && <span className="font-normal text-subtle"> (opcional)</span>}
              </Label>
              {f.options ? (
                <Select
                  value={values[f.key] || f.options[0]!.value}
                  onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                >
                  <SelectTrigger id={`int-${def.id}-${f.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id={`int-${def.id}-${f.key}`}
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    translate="no"
                    spellCheck={false}
                    value={values[f.key] ?? ""}
                    placeholder={
                      saved ? "•••••••• guardado no cofre (deixe vazio para manter)" : f.placeholder
                    }
                    onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                  {isAuto && saved ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Gerar novo ${f.label}`}
                      title="Gerar um novo (lembre de trocar no fornecedor)"
                      onClick={() => setValues((s) => ({ ...s, [f.key]: newWebhookToken() }))}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              )}
              {f.help && !guide ? <p className="text-[11px] text-subtle">{f.help}</p> : null}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={save.isPending || test.isPending} className="flex-1">
            {(save.isPending || test.isPending) && <Loader2 className="animate-spin" />}
            {def.testable ? "Salvar e testar" : "Salvar"}
          </Button>
          {def.testable && state && state.status !== "off" ? (
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() =>
                test.mutate(def.id, {
                  onSuccess: (r) => toast.success(r.message),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Testar de novo
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-subtle">
          Chaves e segredos ficam no cofre criptografado da sua central. Ninguém da equipe vê o
          valor depois de salvo.
        </p>
      </form>
    </div>
  );
}

function FormChooser({
  accountId,
  id,
  value,
  onChange,
}: {
  accountId: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const forms = useForms(accountId);
  useEffect(() => {
    if (!value && forms.data?.[0]) onChange(forms.data[0].id);
  }, [forms.data, value, onChange]);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Formulário do Nexus que recebe estes leads</Label>
      {forms.data?.length ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Escolha o formulário" />
          </SelectTrigger>
          <SelectContent>
            {forms.data.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          {forms.isPending ? (
            "Carregando os formulários…"
          ) : (
            <>
              Você ainda não tem formulário. Crie um em{" "}
              <a href="/captacao" className="underline underline-offset-2">
                Captação
              </a>{" "}
              e volte aqui: o endereço aparece pronto.
            </>
          )}
        </p>
      )}
    </div>
  );
}
