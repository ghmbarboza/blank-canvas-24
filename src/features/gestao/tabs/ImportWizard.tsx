import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCsv } from "@/features/contacts/csv";
import { useCustomFields } from "@/features/custom-fields/api";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useCommitImport, usePreviewImport, type ImportPreview, type ImportResult } from "../api";
import { MAX_ROWS_CLIENT } from "../import/limits";
import {
  SOURCE_LABEL,
  TARGET_LABEL,
  buildRecords,
  detectSource,
  suggestMapping,
  targetLabel,
  type CustomFieldDef,
  type ImportSource,
  type TargetField,
} from "../import/mapping";
import { readXlsx } from "../import/xlsx";
import { BrandTile } from "@/components/brand/BrandIcon";

interface Sheet {
  fileName: string;
  headers: string[];
  rows: string[][];
}

type Step = "file" | "map" | "preview" | "done";

// Importador guiado: arquivo → colunas (sugeridas) → prévia com deduplicação → relatório.
export function ImportWizard({
  accountId,
  onDone,
}: {
  accountId: string;
  onDone?: (r: ImportResult) => void;
}) {
  const [step, setStep] = useState<Step>("file");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [source, setSource] = useState<ImportSource>("planilha");
  const [mapping, setMapping] = useState<TargetField[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = useCustomFields(accountId);
  const previewM = usePreviewImport(accountId);
  const commitM = useCommitImport(accountId);

  const custom: CustomFieldDef[] = useMemo(
    () =>
      (fields.data ?? [])
        .filter(
          (f) =>
            !f.archived &&
            (f.entity === "contact" || f.entity === "company" || f.entity === "deal"),
        )
        .map((f) => ({ entity: f.entity as CustomFieldDef["entity"], key: f.key, label: f.label })),
    [fields.data],
  );
  const customLabels = Object.fromEntries(
    custom.map((c) => [
      `custom.${c.entity}.${c.key}`,
      `${c.entity === "contact" ? "Contato" : c.entity === "company" ? "Empresa" : "Negócio"}: ${c.label}`,
    ]),
  );
  const targets = [...Object.keys(TARGET_LABEL), ...Object.keys(customLabels)];

  const payload = () => {
    if (!sheet) throw new Error("Sem arquivo");
    return {
      source,
      fileName: sheet.fileName,
      mapping,
      records: buildRecords(sheet.rows, mapping),
    };
  };

  async function onFile(file: File) {
    setReading(true);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      if (/\.xls$/i.test(file.name))
        throw new Error("Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv.");
      const all = isXlsx ? await readXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
      const [headers, ...rows] = all;
      if (!headers || rows.length === 0)
        throw new Error("A planilha está vazia ou só tem o cabeçalho.");
      if (rows.length > MAX_ROWS_CLIENT)
        throw new Error(
          `São ${formatNumber(rows.length)} linhas. Divida em arquivos de até ${formatNumber(MAX_ROWS_CLIENT)}.`,
        );
      const detected = detectSource(headers);
      setSheet({ fileName: file.name.slice(0, 200), headers, rows });
      setSource(detected);
      setMapping(suggestMapping(headers, rows.slice(0, 30), custom, detected));
      setStep("map");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function runPreview() {
    if (!mapping.some((m) => m !== "ignore")) {
      toast.error("Escolha o destino de pelo menos uma coluna");
      return;
    }
    previewM.mutate(payload(), {
      onSuccess: (p) => {
        setPreview(p);
        setStep("preview");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  function runCommit() {
    commitM.mutate(payload(), {
      onSuccess: (r) => {
        setResult(r);
        setStep("done");
        toast.success("Importação concluída");
        onDone?.(r);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  if (step === "file")
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-8 text-center">
        <FileSpreadsheet className="mx-auto size-8 text-primary" aria-hidden />
        <div className="mt-3 flex justify-center gap-2" aria-hidden>
          {["rdstation", "kommo", "pipedrive", "hubspot"].map((b) => (
            <BrandTile key={b} id={b} size={28} />
          ))}
        </div>
        <p className="mt-3 text-[15px] font-medium">Traga seus contatos, empresas e negócios</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          Planilha CSV ou Excel (.xlsx), ou a exportação do RD Station CRM, Kommo, Pipedrive ou
          HubSpot. A gente reconhece as colunas e mostra tudo antes de gravar.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.txt,text/csv"
          className="sr-only"
          id="import-file"
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        <Button className="mt-5" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-3.5" aria-hidden />
          )}{" "}
          Escolher arquivo
        </Button>
      </div>
    );

  if (step === "map" && sheet)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold">{sheet.fileName}</p>
            <p className="text-[12px] text-muted-foreground">
              {formatNumber(sheet.rows.length)} linhas · confira para onde vai cada coluna
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Origem</span>
            <Select
              value={source}
              onValueChange={(v) => {
                const s = v as ImportSource;
                setSource(s);
                setMapping(suggestMapping(sheet.headers, sheet.rows.slice(0, 30), custom, s));
              }}
            >
              <SelectTrigger className="h-9 w-52" aria-label="Origem do arquivo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as ImportSource[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {sheet.headers.map((h, i) => (
            <li
              key={`${h}-${i}`}
              className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_1fr_240px] sm:items-center"
            >
              <span className="truncate text-[13px] font-medium">{h || `Coluna ${i + 1}`}</span>
              <span className="truncate text-[12px] text-muted-foreground">
                {sheet.rows
                  .slice(0, 3)
                  .map((r) => r[i])
                  .filter(Boolean)
                  .join(" · ") || "vazia"}
              </span>
              <Select
                value={mapping[i] ?? "ignore"}
                onValueChange={(v) =>
                  setMapping(mapping.map((m, j) => (j === i ? (v as TargetField) : m)))
                }
              >
                <SelectTrigger className="h-9" aria-label={`Destino da coluna ${h}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      disabled={
                        t !== "ignore" && t !== mapping[i] && mapping.includes(t as TargetField)
                      }
                    >
                      {targetLabel(t, customLabels)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setStep("file")}>
            <ArrowLeft className="size-3.5" aria-hidden /> Outro arquivo
          </Button>
          <Button onClick={runPreview} disabled={previewM.isPending}>
            {previewM.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Ver
            prévia
          </Button>
        </div>
      </div>
    );

  if (step === "preview" && preview) {
    const t = preview.totals;
    return (
      <div className="space-y-4">
        <div className="rounded-[24px] bg-primary p-5 text-primary-foreground">
          <p className="eyebrow text-primary-foreground/60">Prévia, nada foi gravado ainda</p>
          <p className="mt-2 text-[15px] leading-relaxed">
            {formatNumber(t.contactsNew)} contatos novos, {formatNumber(t.contactsUpdated)} já
            existentes que serão completados, {formatNumber(t.companiesNew)} empresas novas (
            {formatNumber(t.companiesExisting)} já existiam) e {formatNumber(t.deals)} negócios.
          </p>
          <p className="mt-1 text-[13px] text-primary-foreground/70">
            {formatNumber(t.mergedInFile)} linhas repetidas na planilha foram juntadas pelo e-mail
            ou telefone. {formatNumber(t.skipped)} linhas ficam de fora.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface p-4">
            <p className="eyebrow mb-2">Exemplos de contatos</p>
            <ul className="space-y-1.5 text-[13px]">
              {preview.sample.contacts.map((c, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{c.name ?? c.email ?? c.phone}</span>
                  <span className="shrink-0 text-[11px] text-subtle">
                    {c.action === "create"
                      ? "novo"
                      : c.fills.length
                        ? `completa ${c.fills.join(", ")}`
                        : "já existe"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-border bg-surface p-4">
            <p className="eyebrow mb-2">Avisos</p>
            {preview.warnings.length + preview.skipped.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nenhum problema encontrado.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-[12px]">
                {[
                  ...preview.skipped.map((s) => ({ line: s.line, message: `Fora: ${s.reason}` })),
                  ...preview.warnings,
                ]
                  .slice(0, 60)
                  .map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-subtle" aria-hidden />
                      <span>
                        Linha {w.line}: {w.message}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setStep("map")}>
            <ArrowLeft className="size-3.5" aria-hidden /> Ajustar colunas
          </Button>
          <Button onClick={runCommit} disabled={commitM.isPending}>
            {commitM.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}{" "}
            Importar agora
          </Button>
        </div>
      </div>
    );
  }

  if (step === "done" && result) {
    const r = result.report;
    return (
      <div className="space-y-3 rounded-[24px] border border-border bg-surface p-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <CheckCircle2 className="size-5 text-foreground" aria-hidden /> O que entrou
        </p>
        <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
          <li>{formatNumber(r.contactsCreated)} contatos criados</li>
          <li>{formatNumber(r.contactsUpdated)} contatos completados</li>
          <li>{formatNumber(r.companiesCreated)} empresas criadas</li>
          <li>{formatNumber(r.dealsCreated)} negócios criados</li>
          <li>{formatNumber(r.mergedInFile)} repetidos juntados</li>
          <li>{formatNumber(r.skipped)} linhas fora</li>
        </ul>
        {r.errors.length > 0 && (
          <div className="rounded-xl bg-danger/10 p-3 text-[12px] text-danger">
            <p className="font-medium">{r.errors.length} registro(s) não entraram:</p>
            <ul className="mt-1 space-y-0.5">
              {r.errors.slice(0, 10).map((e, i) => (
                <li key={i}>
                  Linha {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setStep("file");
            setSheet(null);
            setPreview(null);
            setResult(null);
          }}
        >
          Importar outro arquivo
        </Button>
      </div>
    );
  }
  return null;
}
