import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowRight, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SiteImportBox } from "@/features/catalog/SiteImportBox";
import {
  useDeleteDocument,
  useDocuments,
  useUploadDocuments,
  type KbDocument,
} from "@/features/setup-chat/api";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useSaveKnowledgeText } from "../api";
import { ACCEPT, sortFiles } from "./files";
import { StepError, type StepProps } from "./ui";

const STATUS: Record<KbDocument["status"], { label: string; className: string }> = {
  processing: { label: "Lendo…", className: "text-warm-fg" },
  ready: { label: "Pronto", className: "text-foreground" },
  error: { label: "Erro", className: "text-hot-fg" },
};

function DocList({ accountId }: { accountId: string }) {
  const docs = useDocuments(accountId);
  const remove = useDeleteDocument(accountId);
  if (docs.isLoading)
    return (
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />
    );
  if (!docs.data?.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        Nada na base ainda. O que você subir ou colar aparece aqui.
      </p>
    );
  return (
    <ul className="divide-y divide-border rounded-xl border border-border" aria-live="polite">
      {docs.data.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{d.name}</p>
            <p className={cn("text-[12px]", STATUS[d.status].className)}>
              {d.status === "error"
                ? `Erro: ${d.error ?? "não consegui ler"}. Apague e suba de novo, ou cole o texto.`
                : d.status === "ready"
                  ? `Pronto, ${d.chunks} ${d.chunks === 1 ? "trecho" : "trechos"} para o atendente consultar`
                  : STATUS[d.status].label}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Apagar ${d.name}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(d, { onError: (e) => toast.error(errorMessage(e)) })}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Passo 3: subir arquivos (arrastar e soltar), colar texto ou pergunta e resposta. */
export function KnowledgeStep({ accountId, onNext, done }: StepProps & { done: boolean }) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadDocuments(accountId);
  const saveText = useSaveKnowledgeText(accountId);
  const [over, setOver] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  function send(list: FileList | File[] | null) {
    const { ok, refused } = sortFiles([...(list ?? [])]);
    setProblems(refused);
    if (!ok.length) return;
    upload.mutate(ok, {
      onSuccess: (r) => {
        const bad = r
          .filter((x) => !x.ok)
          .map((x) => `${x.name}: ${x.error ?? "não consegui ler"}`);
        setProblems((cur) => [...cur, ...bad]);
        const good = r.filter((x) => x.ok).length;
        if (good) toast.success(good === 1 ? "1 arquivo lido" : `${good} arquivos lidos`);
      },
      onError: (e) => setProblems((cur) => [...cur, errorMessage(e)]),
    });
    if (input.current) input.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    send(e.dataTransfer.files);
  }

  function submitText(e: FormEvent) {
    e.preventDefault();
    saveText.mutate(
      { title: title.trim() || "Texto colado", content },
      {
        onSuccess: () => {
          toast.success("Texto guardado na base");
          setTitle("");
          setContent("");
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  function submitQa(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    saveText.mutate(
      { title: q.slice(0, 180), content: `Pergunta: ${q}\nResposta: ${answer.trim()}` },
      {
        onSuccess: () => {
          toast.success("Pergunta e resposta guardadas");
          setQuestion("");
          setAnswer("");
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <div className="space-y-5">
      <Tabs defaultValue="arquivos">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="arquivos">Subir arquivos</TabsTrigger>
          <TabsTrigger value="texto">Colar texto</TabsTrigger>
          <TabsTrigger value="qa">Pergunta e resposta</TabsTrigger>
          <TabsTrigger value="site">Ler o site</TabsTrigger>
        </TabsList>

        <TabsContent value="arquivos" className="mt-3">
          <label
            htmlFor={`${uid}-file`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
              "focus-within:ring-2 focus-within:ring-ring",
              over ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/30",
            )}
          >
            {upload.isPending ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
            )}
            <span className="text-[14px] font-medium">
              {upload.isPending
                ? "Enviando e lendo os arquivos…"
                : "Arraste os arquivos para cá ou clique para escolher"}
            </span>
            <span className="text-[12px] text-muted-foreground">
              PDF, Word (.docx) ou texto (.txt), até 20 MB cada. Ex.: política de troca, garantia,
              manual, tabela de prazos.
            </span>
            <input
              ref={input}
              id={`${uid}-file`}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => send(e.target.files)}
            />
          </label>
        </TabsContent>

        <TabsContent value="texto" className="mt-3">
          <form onSubmit={submitText} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-title`}>Título</Label>
              <Input
                id={`${uid}-title`}
                value={title}
                maxLength={200}
                placeholder="Ex.: Política de troca e devolução"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-content`}>Texto</Label>
              <Textarea
                id={`${uid}-content`}
                value={content}
                rows={7}
                maxLength={60_000}
                placeholder="Cole aqui o texto que o atendente precisa saber."
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saveText.isPending || content.trim().length < 20}>
              {saveText.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Guardar na base
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="qa" className="mt-3">
          <form onSubmit={submitQa} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-q`}>Pergunta que o cliente faz</Label>
              <Input
                id={`${uid}-q`}
                value={question}
                maxLength={180}
                placeholder="Ex.: Qual é o prazo de entrega?"
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-a`}>Resposta certa</Label>
              <Textarea
                id={`${uid}-a`}
                value={answer}
                rows={3}
                maxLength={4000}
                placeholder="Ex.: Entregamos em até 7 dias úteis para a capital."
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={
                saveText.isPending || question.trim().length < 5 || answer.trim().length < 5
              }
            >
              {saveText.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Guardar pergunta e resposta
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="site" className="mt-3">
          <SiteImportBox
            accountId={accountId}
            hint="Eu leio o site e guardo o resumo, as políticas (troca, entrega, garantia) e o que vocês vendem para o atendente consultar."
          />
        </TabsContent>
      </Tabs>

      {problems.length ? (
        <StepError>
          {problems.map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))}
        </StepError>
      ) : null}

      <section aria-labelledby={`${uid}-list`} className="space-y-2">
        <h3 id={`${uid}-list`} className="text-[13px] font-semibold">
          O que já está na base
        </h3>
        <DocList accountId={accountId} />
      </section>

      {done ? (
        <Button className="h-11" onClick={onNext}>
          Continuar
          <ArrowRight aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
