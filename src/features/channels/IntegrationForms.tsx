import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/functions";
import { hasSecret, useSaveIntegration, type IntegrationsState } from "./api";
import { SecretInput } from "./SecretInput";
import { useSaveZernioKey, useTestZernio } from "./zernio-api";

interface FormProps {
  accountId: string;
  state: IntegrationsState | undefined;
  onSaved?: () => void;
}

function useSave(accountId: string, label: string, onSaved?: () => void) {
  const save = useSaveIntegration(accountId);
  const submit = (input: Parameters<typeof save.mutate>[0], reset: () => void) =>
    save.mutate(input, {
      onSuccess: (res) => {
        if (res.ok) {
          toast.success(`${label} conectado`);
          reset();
          onSaved?.();
        } else {
          toast.error(res.error ? `${label}: ${res.error}` : `${label} não respondeu`);
        }
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  return { submit, pending: save.isPending };
}

function SaveButton({ pending, label = "Salvar e testar" }: { pending: boolean; label?: string }) {
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? "Testando…" : label}
    </Button>
  );
}

export function EvolutionServerForm({ accountId, state, onSaved }: FormProps) {
  const current = state?.byProvider["evolution"];
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const configured = hasSecret(state, "evolution");
  const { submit, pending } = useSave(accountId, "Servidor Evolution", onSaved);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const url = baseUrl.trim();
    if (!url.startsWith("https://")) {
      toast.error("A URL precisa começar com https://");
      return;
    }
    if (!configured && !apiKey.trim()) {
      toast.error("Informe a chave de acesso do servidor");
      return;
    }
    submit(
      { provider: "evolution", baseUrl: url, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      () => setApiKey(""),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" autoComplete="off">
      <div className="space-y-1.5">
        <Label htmlFor="evo-url">URL do servidor</Label>
        <Input
          id="evo-url"
          type="url"
          inputMode="url"
          placeholder="https://evolution.suaempresa.com.br"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      </div>
      <SecretInput
        id="evo-key"
        label="Chave de acesso do servidor"
        value={apiKey}
        onChange={setApiKey}
        configured={configured}
        required
      />
      <SaveButton pending={pending} />
    </form>
  );
}

export function ZernioKeyForm({ accountId, state, onSaved }: FormProps) {
  const [apiKey, setApiKey] = useState("");
  const configured = hasSecret(state, "zernio");
  const save = useSaveZernioKey(accountId);
  const test = useTestZernio(accountId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured && !apiKey.trim()) {
      toast.error("Cole a chave de API da Zernio");
      return;
    }
    save.mutate(apiKey.trim() || null, {
      onSuccess: (r) => {
        toast.success(
          `Zernio conectada: ${r.accounts} ${r.accounts === 1 ? "conta" : "contas"}, ${r.whatsapp} de WhatsApp`,
        );
        setApiKey("");
        onSaved?.();
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  function runTest() {
    test.mutate(undefined, {
      onSuccess: (r) => toast.success(r.message ?? "Conexão ok"),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" autoComplete="off">
      <SecretInput
        id="zernio-key"
        label="Chave de API"
        value={apiKey}
        onChange={setApiKey}
        configured={configured}
        placeholder="sk_…"
        required
      />
      <p className="text-[12px] text-muted-foreground">
        Em zernio.com › Settings › API Keys. A chave é da sua empresa e fica no cofre; o webhook é
        registrado sozinho.
      </p>
      <div className="flex flex-wrap gap-2">
        <SaveButton pending={save.isPending} />
        {configured && (
          <Button type="button" variant="outline" onClick={runTest} disabled={test.isPending}>
            {test.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Testar conexão
          </Button>
        )}
      </div>
    </form>
  );
}

export function AiKeyForm({
  accountId,
  state,
  provider,
  model: initialModel,
}: FormProps & { provider: "openai" | "anthropic"; model: string }) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialModel);
  const configured = hasSecret(state, provider);
  const label = provider === "openai" ? "OpenAI" : "Anthropic";
  const { submit, pending } = useSave(accountId, label);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured && !apiKey.trim()) {
      toast.error(`Cole a chave da ${label}`);
      return;
    }
    submit(
      { provider, model: model.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      () => setApiKey(""),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" autoComplete="off">
      <SecretInput
        id={`${provider}-key`}
        label={`Chave da ${label}`}
        value={apiKey}
        onChange={setApiKey}
        configured={configured}
        placeholder={provider === "openai" ? "sk-…" : "sk-ant-…"}
        required
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-model`}>Modelo (opcional)</Label>
        <Input
          id={`${provider}-model`}
          value={model}
          maxLength={60}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Deixe vazio para o padrão"
        />
      </div>
      <SaveButton pending={pending} label="Salvar e usar esta IA" />
    </form>
  );
}
