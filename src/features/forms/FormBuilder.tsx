import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ClipboardList,
  Copy,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { fieldsFor, useCustomFields } from "@/features/custom-fields/api";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { useDeleteForm, useForm, useSaveForm, type FormRow } from "./api";
import { DeleteWithConfirm } from "./DeleteWithConfirm";
import { formDeleteWarning } from "./deleteWarning";
import { copyText } from "./copy-text";
import { PublicFormView } from "./PublicFormView";
import { ScheduleRuleEditor } from "./ScheduleRuleEditor";
import { FIELD_TYPE_LABEL, MAP_LABEL, type FormField, type FormFieldType } from "./types";

function slugKey(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || `campo_${Date.now().toString(36)}`
  );
}

export function FormBuilder({ formId }: { formId: string }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const q = useForm(formId);
  const save = useSaveForm(accountId);
  const remove = useDeleteForm(accountId);
  const navigate = useNavigate();
  const team = useTeamMembers(accountId);
  const custom = useCustomFields(accountId);
  const stages = useQuery({
    queryKey: ["form-stages", accountId],
    queryFn: async () =>
      (
        await supabase
          .from("pipeline_stages")
          .select("id, name, pipeline_id, pipelines(name)")
          .eq("account_id", accountId)
          .order("position")
      ).data ?? [],
  });
  const [draft, setDraft] = useState<FormRow | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (q.data && !dirty) setDraft(q.data);
  }, [q.data, dirty]);

  if (q.isPending)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[60dvh] rounded-[24px]" />
      </div>
    );
  if (!draft)
    return (
      <EmptyState
        icon={ClipboardList}
        title="Formulário não encontrado"
        action={
          <Button asChild variant="outline">
            <Link to="/formularios">Voltar</Link>
          </Button>
        }
      />
    );

  const ro = !isManager;
  const upd = (patch: Partial<FormRow>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const setField = (i: number, patch: Partial<FormField>) =>
    upd({ fields: draft.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const move = (i: number, dir: -1 | 1) => {
    const arr = [...draft.fields];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    upd({ fields: arr });
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/f/${draft.id}`;
  const embed = `<div data-vinculo-form="${draft.id}"></div>\n<script src="${origin}/api/public/widget.js" data-account="${accountId}" async></script>`;
  const mapOptions = [
    { value: "__none", label: "Só guardar na resposta" },
    ...Object.entries(MAP_LABEL).map(([k, v]) => ({ value: k, label: v })),
    ...fieldsFor(custom.data, "contact").map((f) => ({
      value: `custom.${f.key}`,
      label: `Campo: ${f.label}`,
    })),
  ];

  async function persist() {
    if (!draft) return;
    const keys = draft.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      toast.error("Dois campos com o mesmo nome interno. Renomeie um deles.");
      return;
    }
    if (!draft.fields.some((f) => f.map === "email" || f.map === "phone")) {
      toast.error(
        "Inclua um campo de e-mail ou telefone ligado ao contato, senão não dá para retornar.",
      );
      return;
    }
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        title: draft.title,
        description: draft.description,
        fields: draft.fields,
        consent: draft.consent,
        destination: draft.destination,
        submit_label: draft.submit_label,
        success_message: draft.success_message,
        redirect_url: draft.redirect_url || null,
        theme: draft.theme,
        status: draft.status,
      });
      setDraft(saved);
      setDirty(false);
      toast.success("Formulário salvo");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="atmosphere flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        <Link
          to="/formularios"
          className="rounded-full p-1.5 text-subtle hover:bg-surface-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Input
          value={draft.name}
          onChange={(e) => upd({ name: e.target.value })}
          disabled={ro}
          className="h-9 max-w-xs border-transparent bg-transparent font-display text-[18px] font-semibold shadow-none hover:border-border"
          aria-label="Nome interno"
        />
        <label className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={draft.status === "active"}
            onCheckedChange={(c) => upd({ status: c ? "active" : "paused" })}
            disabled={ro}
          />{" "}
          {draft.status === "active" ? "No ar" : "Pausado"}
        </label>
        {dirty && <span className="text-[12px] text-subtle">alterações não salvas</span>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => copyText(link)}>
            <Copy /> Link
          </Button>
          {!ro && (
            <>
              <DeleteWithConfirm
                title={`Excluir “${draft.name}”?`}
                description={formDeleteWarning(
                  q.data?.status === "active",
                  q.data?.submissions_count ?? 0,
                )}
                pending={remove.isPending}
                onConfirm={() =>
                  remove
                    .mutateAsync(draft.id)
                    .then(() => {
                      toast.success("Formulário excluído");
                      void navigate({ to: "/formularios" });
                      return true;
                    })
                    .catch((e: unknown) => {
                      toast.error(errorMessage(e));
                      return false;
                    })
                }
              />
              <Button size="sm" onClick={() => void persist()} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
              </Button>
            </>
          )}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3">O que o visitante vê</p>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="fb-title">Título</Label>
                <Input
                  id="fb-title"
                  value={draft.title ?? ""}
                  onChange={(e) => upd({ title: e.target.value })}
                  disabled={ro}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fb-desc">Texto de apoio</Label>
                <Textarea
                  id="fb-desc"
                  rows={2}
                  value={draft.description ?? ""}
                  onChange={(e) => upd({ description: e.target.value })}
                  disabled={ro}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-btn">Texto do botão</Label>
                  <Input
                    id="fb-btn"
                    value={draft.submit_label}
                    onChange={(e) => upd({ submit_label: e.target.value })}
                    disabled={ro}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="fb-color">Cor</Label>
                  <Input
                    id="fb-color"
                    type="color"
                    className="h-10 w-24 p-1"
                    value={draft.theme.accent ?? "#001F35"}
                    onChange={(e) => upd({ theme: { ...draft.theme, accent: e.target.value } })}
                    disabled={ro}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Campos</p>
              {!ro && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    upd({
                      fields: [
                        ...draft.fields,
                        {
                          key: `campo_${draft.fields.length + 1}`,
                          label: "Novo campo",
                          type: "text",
                          required: false,
                          map: null,
                        },
                      ],
                    })
                  }
                >
                  <Plus /> Campo
                </Button>
              )}
            </div>
            <ul className="space-y-3">
              {draft.fields.map((f, i) => (
                <li key={i} className="rounded-2xl border border-border bg-surface-2/40 p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <Input
                      value={f.label}
                      onChange={(e) =>
                        setField(i, {
                          label: e.target.value,
                          ...(f.key.startsWith("campo_") ? { key: slugKey(e.target.value) } : {}),
                        })
                      }
                      disabled={ro}
                      aria-label="Pergunta"
                    />
                    <Select
                      value={f.type}
                      onValueChange={(v) => setField(i, { type: v as FormFieldType })}
                      disabled={ro}
                    >
                      <SelectTrigger aria-label="Tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Subir"
                        onClick={() => move(i, -1)}
                        disabled={ro}
                        className="rounded-full p-1.5 text-subtle hover:bg-surface"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Descer"
                        onClick={() => move(i, 1)}
                        disabled={ro}
                        className="rounded-full p-1.5 text-subtle hover:bg-surface"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remover"
                        onClick={() => upd({ fields: draft.fields.filter((_, j) => j !== i) })}
                        disabled={ro}
                        className="rounded-full p-1.5 text-subtle hover:bg-surface hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Select
                      value={f.map ?? "__none"}
                      onValueChange={(v) =>
                        setField(i, { map: v === "__none" ? null : (v as FormField["map"]) })
                      }
                      disabled={ro}
                    >
                      <SelectTrigger aria-label="Vai para">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {mapOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={
                        f.type === "select" ? (f.options ?? []).join(", ") : (f.placeholder ?? "")
                      }
                      placeholder={
                        f.type === "select"
                          ? "Opções separadas por vírgula"
                          : f.type === "hidden"
                            ? "Valor fixo (ou a UTM de mesmo nome)"
                            : "Texto de exemplo"
                      }
                      onChange={(e) =>
                        f.type === "select"
                          ? setField(i, {
                              options: e.target.value
                                .split(",")
                                .map((o) => o.trim())
                                .filter(Boolean),
                            })
                          : f.type === "hidden"
                            ? setField(i, { default: e.target.value })
                            : setField(i, { placeholder: e.target.value })
                      }
                      disabled={ro}
                    />
                    <label className="flex items-center gap-2 text-[12px]">
                      <Checkbox
                        checked={f.required}
                        onCheckedChange={(c) => setField(i, { required: Boolean(c) })}
                        disabled={ro}
                      />{" "}
                      Obrigatório
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3">Consentimento (LGPD)</p>
            <label className="mb-3 flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[13px]">
              Pedir autorização de contato
              <Switch
                checked={draft.consent.enabled}
                onCheckedChange={(c) => upd({ consent: { ...draft.consent, enabled: c } })}
                disabled={ro}
              />
            </label>
            {draft.consent.enabled && (
              <div className="grid gap-3">
                <Textarea
                  rows={2}
                  value={draft.consent.text}
                  onChange={(e) => upd({ consent: { ...draft.consent, text: e.target.value } })}
                  disabled={ro}
                  aria-label="Texto do consentimento"
                />
                <div className="flex flex-wrap gap-4 text-[13px]">
                  {(["email", "whatsapp", "sms"] as const).map((ch) => (
                    <label key={ch} className="flex items-center gap-2">
                      <Checkbox
                        checked={draft.consent.channels.includes(ch)}
                        onCheckedChange={(c) =>
                          upd({
                            consent: {
                              ...draft.consent,
                              channels: c
                                ? [...draft.consent.channels, ch]
                                : draft.consent.channels.filter((x) => x !== ch),
                            },
                          })
                        }
                        disabled={ro}
                      />
                      {ch === "email" ? "E-mail" : ch === "whatsapp" ? "WhatsApp" : "SMS"}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={draft.consent.required}
                      onCheckedChange={(c) =>
                        upd({ consent: { ...draft.consent, required: Boolean(c) } })
                      }
                      disabled={ro}
                    />
                    Obrigatório para enviar
                  </label>
                </div>
                <p className="text-[11px] text-subtle">
                  Cada aceite fica registrado no contato com data, página e navegador (prova para a
                  LGPD).
                </p>
              </div>
            )}
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3">Depois do envio</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Responsável pelo lead</Label>
                <Select
                  value={draft.destination.owner_mode}
                  onValueChange={(v) =>
                    upd({
                      destination: {
                        ...draft.destination,
                        owner_mode: v as FormRow["destination"]["owner_mode"],
                      },
                    })
                  }
                  disabled={ro}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguém (fica para a equipe)</SelectItem>
                    <SelectItem value="user">Uma pessoa</SelectItem>
                    <SelectItem value="round_robin">Rodízio entre vendedores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.destination.owner_mode !== "none" && (
                <div className="grid gap-2">
                  <Label>{draft.destination.owner_mode === "user" ? "Quem" : "Entre"}</Label>
                  <div className="flex flex-wrap gap-3">
                    {(team.data ?? []).map((m) => (
                      <label key={m.userId} className="flex items-center gap-2 text-[13px]">
                        <Checkbox
                          checked={draft.destination.users.includes(m.userId)}
                          onCheckedChange={(c) =>
                            upd({
                              destination: {
                                ...draft.destination,
                                users:
                                  draft.destination.owner_mode === "user"
                                    ? c
                                      ? [m.userId]
                                      : []
                                    : c
                                      ? [...draft.destination.users, m.userId]
                                      : draft.destination.users.filter((u) => u !== m.userId),
                              },
                            })
                          }
                          disabled={ro}
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[13px] sm:col-span-2">
                Abrir negócio no funil
                <Switch
                  checked={draft.destination.create_deal}
                  onCheckedChange={(c) =>
                    upd({ destination: { ...draft.destination, create_deal: c } })
                  }
                  disabled={ro}
                />
              </label>
              {draft.destination.create_deal && (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Na etapa</Label>
                  <Select
                    value={draft.destination.stage_id ?? "__first"}
                    onValueChange={(v) => {
                      const st = (stages.data ?? []).find((s) => s.id === v);
                      upd({
                        destination: {
                          ...draft.destination,
                          stage_id: v === "__first" ? null : v,
                          pipeline_id: st?.pipeline_id ?? null,
                        },
                      });
                    }}
                    disabled={ro}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__first">Primeira etapa do funil padrão</SelectItem>
                      {(stages.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {(s.pipelines as unknown as { name: string } | null)?.name} · {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="fb-tags">Etiquetas no contato</Label>
                <Input
                  id="fb-tags"
                  value={draft.destination.tags.join(", ")}
                  onChange={(e) =>
                    upd({
                      destination: {
                        ...draft.destination,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  disabled={ro}
                  placeholder="ex.: site, ebook"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fb-redirect">Levar para a página (opcional)</Label>
                <Input
                  id="fb-redirect"
                  value={draft.redirect_url ?? ""}
                  onChange={(e) => upd({ redirect_url: e.target.value })}
                  disabled={ro}
                  placeholder="https://…/obrigado"
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="fb-ok">Mensagem de agradecimento</Label>
                <Input
                  id="fb-ok"
                  value={draft.success_message}
                  onChange={(e) => upd({ success_message: e.target.value })}
                  disabled={ro}
                />
              </div>
            </div>
            <p className="mt-3 text-[12px] text-subtle">
              Para mandar WhatsApp, e-mail ou criar tarefa depois do envio, crie uma automação com o
              gatilho “Formulário enviado”.
            </p>
          </section>

          <ScheduleRuleEditor
            accountId={accountId}
            fields={draft.fields}
            value={draft.destination.schedule}
            disabled={ro}
            onChange={(schedule) => upd({ destination: { ...draft.destination, schedule } })}
          />
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3">Prévia</p>
            <PublicFormView
              form={{
                id: draft.id,
                title: draft.title ?? draft.name,
                description: draft.description,
                fields: draft.fields,
                consent: draft.consent,
                submit_label: draft.submit_label,
                theme: draft.theme,
              }}
              preview
            />
          </section>
          <section className="rounded-[24px] border border-border bg-surface p-5">
            <p className="eyebrow mb-3">Publicar</p>
            <Label className="text-[12px]">Link direto (bio, QR code, anúncio)</Label>
            <div className="mt-1 mb-4 flex gap-2">
              <Input readOnly value={link} className="font-mono text-[11px]" />
              <Button size="sm" variant="outline" onClick={() => copyText(link)}>
                <Copy />
              </Button>
            </div>
            <Label className="text-[12px]">Embutir no seu site</Label>
            <pre className="mt-1 mb-2 overflow-x-auto rounded-xl bg-[#001F35] p-3 font-mono text-[10px] text-white/90">
              {embed}
            </pre>
            <Button size="sm" variant="outline" onClick={() => copyText(embed)}>
              <Copy /> Copiar código
            </Button>
            <p className="mt-4 text-[13px] text-muted-foreground">
              Leads dos anúncios da Meta e das outras redes entram pela Zernio, em{" "}
              <Link to="/canais" className="text-foreground underline underline-offset-2">
                Canais
              </Link>
              .
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
