import { useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { TurnstileWidget } from "./TurnstileWidget";
import { validateSubmission, type FormField, type PublicForm } from "./types";

function readUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
  ]) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}

function visitorId(): string | null {
  try {
    let v = localStorage.getItem("nx_vid");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("nx_vid", v);
    }
    return v;
  } catch {
    return null;
  }
}

interface Props {
  form: PublicForm;
  /** Prévia no construtor: não envia. */
  preview?: boolean;
  source?: "form" | "landing";
  className?: string;
}

// Formulário público (página /f/:id, landing e prévia do construtor).
export function PublicFormView({ form, preview = false, source = "form", className }: Props) {
  const started = useRef(Date.now());
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      form.fields.map((f) => [f.key, f.type === "checkbox" ? false : (f.default ?? "")]),
    ),
  );
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const siteKey = !preview && form.turnstile_site_key ? form.turnstile_site_key : null;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{
    kind: "idle" | "sending" | "done" | "error";
    message?: string;
    schedule?: { url: string; label: string } | null;
  }>({ kind: "idle" });
  const accent =
    form.theme?.accent && /^#[0-9a-f]{6}$/i.test(form.theme.accent) ? form.theme.accent : "#0A1F3B";
  const utm = useMemo(readUtm, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateSubmission(form.fields, values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (form.consent.enabled && form.consent.required && !consent) {
      setStatus({ kind: "error", message: "Para enviar, aceite os termos." });
      return;
    }
    if (preview) {
      setStatus({
        kind: "done",
        message: "Prévia: num formulário publicado o lead seria criado agora.",
      });
      return;
    }
    if (siteKey && !turnstileToken) {
      setStatus({
        kind: "error",
        message: "Aguarde a verificação anti-robô terminar e tente de novo.",
      });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/public/forms/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formId: form.id,
          values: Object.fromEntries(
            Object.entries(values).map(([k, v]) => [
              k,
              typeof v === "boolean" ? (v ? "sim" : "") : v,
            ]),
          ),
          consent,
          utm,
          referrer: document.referrer || null,
          pageUrl: window.location.href,
          visitorId: visitorId(),
          hp,
          startedAt: started.current,
          source,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        redirect?: string | null;
        schedule?: { url: string; label: string } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Não deu para enviar");
      // link de agenda vale mais que o redirecionamento: o lead qualificado já escolhe o horário
      const schedule = j.schedule && /^https?:\/\//.test(j.schedule.url) ? j.schedule : null;
      if (j.redirect && !schedule) {
        window.location.href = j.redirect;
        return;
      }
      setStatus({ kind: "done", message: j.message ?? "Recebido!", schedule });
    } catch (err) {
      // o token do Turnstile vale um envio só: pede outro para a próxima tentativa
      if (siteKey) setTurnstileReset((n) => n + 1);
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Não deu para enviar",
      });
    }
  }

  if (status.kind === "done") {
    return (
      <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
        <CheckCircle2 className="size-10" style={{ color: accent }} aria-hidden />
        <p className="max-w-sm text-[15px]">{status.message}</p>
        {status.schedule && (
          <a
            href={status.schedule.url}
            target="_top"
            className="mt-2 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-white"
            style={{ background: accent }}
          >
            <CalendarClock className="size-4" aria-hidden /> {status.schedule.label}
          </a>
        )}
      </div>
    );
  }

  const field = (f: FormField) => {
    const id = `pf-${f.key}`;
    const v = values[f.key];
    const set = (x: string | boolean) => setValues((s) => ({ ...s, [f.key]: x }));
    if (f.type === "hidden") return null;
    if (f.type === "checkbox")
      return (
        <label key={f.key} className="flex items-center gap-2 text-[14px]">
          <Checkbox checked={Boolean(v)} onCheckedChange={(c) => set(Boolean(c))} />
          {f.label}
          {f.required && " *"}
        </label>
      );
    return (
      <div key={f.key} className="grid gap-1.5">
        <Label htmlFor={id}>
          {f.label}
          {f.required && <span className="text-danger"> *</span>}
        </Label>
        {f.type === "textarea" ? (
          <Textarea
            id={id}
            rows={3}
            value={String(v ?? "")}
            placeholder={f.placeholder}
            onChange={(e) => set(e.target.value)}
          />
        ) : f.type === "select" ? (
          <select
            id={id}
            value={String(v ?? "")}
            onChange={(e) => set(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-[14px]"
          >
            <option value="">Escolha</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id={id}
            type={
              f.type === "email"
                ? "email"
                : f.type === "phone"
                  ? "tel"
                  : f.type === "date"
                    ? "date"
                    : "text"
            }
            inputMode={f.type === "number" ? "decimal" : f.type === "phone" ? "tel" : undefined}
            value={String(v ?? "")}
            placeholder={f.placeholder}
            onChange={(e) => set(e.target.value)}
            className="h-10"
          />
        )}
        {errors[f.key] && <p className="text-[12px] text-danger">{errors[f.key]}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={cn("grid gap-4", className)} noValidate>
      {form.title && <h2 className="font-display text-[22px] font-medium">{form.title}</h2>}
      {form.description && (
        <p className="-mt-2 text-[14px] text-muted-foreground">{form.description}</p>
      )}
      {form.fields.map(field)}
      <input
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        name="nx_hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0"
      />
      {form.consent.enabled && (
        <label className="flex items-start gap-2 text-[12px] text-muted-foreground">
          <Checkbox
            checked={consent}
            onCheckedChange={(c) => setConsent(Boolean(c))}
            className="mt-0.5"
          />
          <span>
            {form.consent.text}
            {form.consent.required && " *"}
          </span>
        </label>
      )}
      {siteKey && (
        <TurnstileWidget
          siteKey={siteKey}
          onToken={setTurnstileToken}
          resetSignal={turnstileReset}
        />
      )}
      <Button
        type="submit"
        disabled={status.kind === "sending"}
        className="h-11 rounded-full"
        style={{ background: accent }}
      >
        {status.kind === "sending" && <Loader2 className="animate-spin" />}{" "}
        {form.submit_label || "Enviar"}
      </Button>
      {status.kind === "error" && <p className="text-[13px] text-danger">{status.message}</p>}
    </form>
  );
}
