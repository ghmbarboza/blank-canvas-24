import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { useIntegrationEnabled } from "@/features/integrations/api";
import { usePlaybooks } from "@/features/playbooks/api";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";

import { slugify, useSaveBookingPage, type BookingPage, type BookingQuestion } from "./api";
import type { Availability, TimeRange } from "./slots";

const DAYS = [
  { id: "1", label: "Segunda" },
  { id: "2", label: "Terça" },
  { id: "3", label: "Quarta" },
  { id: "4", label: "Quinta" },
  { id: "5", label: "Sexta" },
  { id: "6", label: "Sábado" },
  { id: "0", label: "Domingo" },
];

// Formulário do link de agendamento (criar e editar).
interface Form {
  title: string;
  slug: string;
  description: string;
  duration_min: number;
  buffer_min: number;
  step_min: number;
  min_notice_min: number;
  window_days: number;
  availability: Availability;
  mode: "owner" | "round_robin";
  owner_user_id: string | null;
  members: { user_id: string; weight: number }[];
  questions: BookingQuestion[];
  location: string;
  location_detail: string;
  playbook_id: string | null;
  create_deal: boolean;
  confirmation_message: string;
  is_active: boolean;
}

const DEFAULT_AVAIL: Availability = Object.fromEntries(
  ["1", "2", "3", "4", "5"].map((d) => [d, [{ start: "09:00", end: "18:00" }]]),
);

export function BookingPageDialog({
  accountId,
  open,
  onOpenChange,
  page,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  page: BookingPage | null;
}) {
  const { user } = useAuth();
  const { isManager } = useAccount();
  const team = useTeamMembers(accountId);
  const playbooks = usePlaybooks(accountId);
  const save = useSaveBookingPage(accountId);
  // sem LiveKit a sala de vídeo não abre: o link novo nasce como ligação e a sala some da lista
  const meetOn = useIntegrationEnabled(accountId, "livekit");
  const [f, setF] = useState<Form | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSlugTouched(Boolean(page));
    setF({
      title: page?.title ?? "Reunião de diagnóstico",
      slug: page?.slug ?? "",
      description: page?.description ?? "",
      duration_min: page?.duration_min ?? 30,
      buffer_min: page?.buffer_min ?? 10,
      step_min: page?.step_min ?? 30,
      min_notice_min: page?.min_notice_min ?? 120,
      window_days: page?.window_days ?? 21,
      availability: (page?.availability as Availability) ?? DEFAULT_AVAIL,
      mode: (page?.mode as Form["mode"]) ?? "owner",
      owner_user_id: page?.owner_user_id ?? user?.id ?? null,
      members: Array.isArray(page?.members) ? (page.members as Form["members"]) : [],
      questions: Array.isArray(page?.questions)
        ? (page.questions as unknown as BookingQuestion[])
        : [],
      location: page?.location ?? (meetOn === false ? "phone" : "nexus_meet"),
      location_detail: page?.location_detail ?? "",
      playbook_id: page?.playbook_id ?? null,
      create_deal: page?.create_deal ?? true,
      confirmation_message: page?.confirmation_message ?? "",
      is_active: page?.is_active ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- meetOn entra no efeito abaixo
  }, [open, page, user?.id]);

  useEffect(() => {
    if (meetOn !== false || page) return;
    setF((s) => (s && s.location === "nexus_meet" ? { ...s, location: "phone" } : s));
  }, [meetOn, page]);

  if (!f) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => (s ? { ...s, [k]: v } : s));
  const setDay = (d: string, ranges: TimeRange[]) =>
    set("availability", { ...f.availability, [d]: ranges });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    const slug = slugify(f.slug || f.title);
    if (slug.length < 3) {
      toast.error("O endereço do link precisa de pelo menos 3 letras");
      return;
    }
    if (f.mode === "round_robin" && f.members.length === 0) {
      toast.error("Escolha quem entra no rodízio");
      return;
    }
    try {
      await save.mutateAsync({
        ...(page ? { id: page.id } : {}),
        values: {
          title: f.title.trim(),
          slug,
          description: f.description.trim() || null,
          duration_min: f.duration_min,
          buffer_min: f.buffer_min,
          step_min: f.step_min,
          min_notice_min: f.min_notice_min,
          window_days: f.window_days,
          availability: f.availability as never,
          mode: f.mode,
          owner_user_id: f.owner_user_id,
          members: f.members as never,
          questions: f.questions.filter((q) => q.label.trim()) as never,
          location: f.location,
          location_detail: f.location_detail.trim() || null,
          playbook_id: f.playbook_id,
          create_deal: f.create_deal,
          confirmation_message: f.confirmation_message.trim() || null,
          is_active: f.is_active,
        },
      });
      toast.success(page ? "Link atualizado" : "Link criado");
      onOpenChange(false);
    } catch (err) {
      const msg = errorMessage(err);
      toast.error(
        msg.includes("booking_pages_slug_key")
          ? "Esse endereço já está em uso. Escolha outro."
          : msg,
      );
    }
  }

  const NumberSelect = ({
    label,
    k,
    opts,
    suffix,
  }: {
    label: string;
    k: "duration_min" | "buffer_min" | "step_min" | "min_notice_min" | "window_days";
    opts: number[];
    suffix: (n: number) => string;
  }) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={String(f[k])} onValueChange={(v) => set(k, Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o} value={String(o)}>
              {suffix(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>
              {page ? "Editar link de agendamento" : "Novo link de agendamento"}
            </DialogTitle>
            <DialogDescription>
              O cliente só vê horários livres na agenda de quem atende, dentro do expediente que
              você definir.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bp-title">Nome da reunião</Label>
                <Input
                  id="bp-title"
                  value={f.title}
                  onChange={(e) => {
                    set("title", e.target.value);
                    if (!slugTouched) set("slug", slugify(e.target.value));
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bp-slug">Endereço</Label>
                <div className="flex items-center rounded-md border border-input bg-background pl-3 text-[12px] text-subtle">
                  /agendar/
                  <input
                    id="bp-slug"
                    className="h-9 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none"
                    value={f.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set("slug", slugify(e.target.value));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bp-desc">Descrição (aparece para o cliente)</Label>
              <Textarea
                id="bp-desc"
                rows={2}
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Em 30 minutos entendemos seu cenário e mostramos o caminho."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberSelect
                label="Duração"
                k="duration_min"
                opts={[15, 20, 30, 45, 60, 90]}
                suffix={(n) => `${n} minutos`}
              />
              <NumberSelect
                label="Intervalo entre reuniões"
                k="buffer_min"
                opts={[0, 5, 10, 15, 30]}
                suffix={(n) => (n ? `${n} min` : "Sem intervalo")}
              />
              <NumberSelect
                label="Horários a cada"
                k="step_min"
                opts={[15, 30, 60]}
                suffix={(n) => `${n} min`}
              />
              <NumberSelect
                label="Antecedência mínima"
                k="min_notice_min"
                opts={[0, 60, 120, 240, 1440, 2880]}
                suffix={(n) =>
                  n === 0 ? "Nenhuma" : n < 1440 ? `${n / 60} h` : `${n / 1440} dia(s)`
                }
              />
              <NumberSelect
                label="Agenda aberta por"
                k="window_days"
                opts={[7, 14, 21, 30, 60]}
                suffix={(n) => `${n} dias`}
              />
            </div>

            <fieldset className="rounded-2xl border border-border p-4">
              <legend className="eyebrow px-1">Expediente (fuso da empresa)</legend>
              <ul className="space-y-2">
                {DAYS.map((d) => {
                  const ranges = f.availability[d.id] ?? [];
                  const on = ranges.length > 0;
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                      <Switch
                        checked={on}
                        onCheckedChange={(c) =>
                          setDay(d.id, c ? [{ start: "09:00", end: "18:00" }] : [])
                        }
                        aria-label={d.label}
                      />
                      <span className="w-20">{d.label}</span>
                      {on ? (
                        ranges.map((r, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <Input
                              type="time"
                              className="h-8 w-[104px]"
                              value={r.start}
                              onChange={(e) =>
                                setDay(
                                  d.id,
                                  ranges.map((x, j) =>
                                    j === i ? { ...x, start: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                            até
                            <Input
                              type="time"
                              className="h-8 w-[104px]"
                              value={r.end}
                              onChange={(e) =>
                                setDay(
                                  d.id,
                                  ranges.map((x, j) =>
                                    j === i ? { ...x, end: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          </span>
                        ))
                      ) : (
                        <span className="text-subtle">Indisponível</span>
                      )}
                      {on && ranges.length < 3 && (
                        <button
                          type="button"
                          className="text-[12px] text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setDay(d.id, [...ranges, { start: "14:00", end: "18:00" }])
                          }
                        >
                          + faixa
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Quem atende</Label>
                <Select
                  value={f.mode}
                  onValueChange={(v) => set("mode", v as Form["mode"])}
                  disabled={!isManager}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Uma pessoa</SelectItem>
                    <SelectItem value="round_robin">Rodízio na equipe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {f.mode === "owner" ? (
                <div className="grid gap-1.5">
                  <Label>Responsável</Label>
                  <Select
                    {...(f.owner_user_id ? { value: f.owner_user_id } : {})}
                    onValueChange={(v) => set("owner_user_id", v)}
                    disabled={!isManager}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {(team.data ?? []).map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label>Rodízio (peso maior recebe mais reuniões)</Label>
                  <ul className="space-y-1.5 rounded-xl border border-border p-2">
                    {(team.data ?? []).map((m) => {
                      const mem = f.members.find((x) => x.user_id === m.userId);
                      return (
                        <li key={m.userId} className="flex items-center gap-2 text-[13px]">
                          <Switch
                            checked={Boolean(mem)}
                            onCheckedChange={(c) =>
                              set(
                                "members",
                                c
                                  ? [...f.members, { user_id: m.userId, weight: 1 }]
                                  : f.members.filter((x) => x.user_id !== m.userId),
                              )
                            }
                            aria-label={m.name}
                          />
                          <span className="flex-1 truncate">{m.name}</span>
                          {mem && (
                            <Select
                              value={String(mem.weight)}
                              onValueChange={(v) =>
                                set(
                                  "members",
                                  f.members.map((x) =>
                                    x.user_id === m.userId ? { ...x, weight: Number(v) } : x,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="h-7 w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3].map((w) => (
                                  <SelectItem key={w} value={String(w)}>
                                    {w}×
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Onde acontece</Label>
                <Select value={f.location} onValueChange={(v) => set("location", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(meetOn !== false || f.location === "nexus_meet") && (
                      <SelectItem value="nexus_meet">
                        Sala Vínculo (vídeo, transcrição e coach)
                      </SelectItem>
                    )}
                    <SelectItem value="phone">Ligação</SelectItem>
                    <SelectItem value="in_person">Presencial</SelectItem>
                    <SelectItem value="custom">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {f.location !== "nexus_meet" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="bp-loc">Detalhe do local</Label>
                  <Input
                    id="bp-loc"
                    value={f.location_detail}
                    onChange={(e) => set("location_detail", e.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Playbook da reunião</Label>
                <Select
                  value={f.playbook_id ?? "auto"}
                  onValueChange={(v) => set("playbook_id", v === "auto" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">O padrão da empresa</SelectItem>
                    {(playbooks.data ?? []).map((p) => (
                      <SelectItem key={p.row.id} value={p.row.id}>
                        {p.row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="rounded-2xl border border-border p-4">
              <legend className="eyebrow px-1">Perguntas para o cliente</legend>
              <ul className="space-y-2">
                {f.questions.map((q, i) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-0 flex-1"
                      value={q.label}
                      placeholder="Ex.: Qual o tamanho da sua equipe?"
                      onChange={(e) =>
                        set(
                          "questions",
                          f.questions.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Select
                      value={q.type}
                      onValueChange={(v) =>
                        set(
                          "questions",
                          f.questions.map((x, j) =>
                            j === i ? { ...x, type: v as BookingQuestion["type"] } : x,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto curto</SelectItem>
                        <SelectItem value="long_text">Texto longo</SelectItem>
                        <SelectItem value="select">Opções</SelectItem>
                      </SelectContent>
                    </Select>
                    {q.type === "select" && (
                      <Input
                        className="w-full"
                        placeholder="Opções separadas por vírgula"
                        value={(q.options ?? []).join(", ")}
                        onChange={(e) =>
                          set(
                            "questions",
                            f.questions.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    options: e.target.value
                                      .split(",")
                                      .map((o) => o.trim())
                                      .filter(Boolean),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    )}
                    <label className="flex items-center gap-1.5 text-[12px]">
                      <Switch
                        checked={q.required}
                        onCheckedChange={(c) =>
                          set(
                            "questions",
                            f.questions.map((x, j) => (j === i ? { ...x, required: c } : x)),
                          )
                        }
                      />{" "}
                      obrigatória
                    </label>
                    <button
                      type="button"
                      aria-label="Remover pergunta"
                      className="rounded-full p-1.5 text-subtle hover:text-danger"
                      onClick={() =>
                        set(
                          "questions",
                          f.questions.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() =>
                  set("questions", [
                    ...f.questions,
                    { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false },
                  ])
                }
              >
                <Plus /> Adicionar pergunta
              </Button>
            </fieldset>

            <div className="grid gap-1.5">
              <Label htmlFor="bp-msg">Mensagem depois de agendar (opcional)</Label>
              <Textarea
                id="bp-msg"
                rows={2}
                value={f.confirmation_message}
                onChange={(e) => set("confirmation_message", e.target.value)}
              />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-[13px]">
              <span>Abrir um negócio no funil para cada agendamento</span>
              <Switch checked={f.create_deal} onCheckedChange={(c) => set("create_deal", c)} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-[13px]">
              <span>Link ativo (aceitando agendamentos)</span>
              <Switch checked={f.is_active} onCheckedChange={(c) => set("is_active", c)} />
            </label>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
