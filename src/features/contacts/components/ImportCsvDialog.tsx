import { useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
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
import { errorMessage } from "@/lib/functions";
import { formatNumber } from "@/lib/format";

import { importContacts, useInvalidateContacts, type ImportReport } from "../api";
import { CSV_HEADERS, CSV_TEMPLATE, buildImport, downloadText, type ParsedImport } from "../csv";

const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportCsvDialog({ accountId, open, onOpenChange }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [running, setRunning] = useState(false);
  const invalidate = useInvalidateContacts(accountId);

  function reset() {
    setFileName(null);
    setParsed(null);
    setReport(null);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 10 MB. Divida em partes.");
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      setReport(null);
      setParsed(buildImport(text));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function run() {
    if (!parsed?.valid.length) return;
    setRunning(true);
    try {
      const result = await importContacts(accountId, parsed.valid);
      setReport(result);
      await invalidate();
      if (result.inserted) toast.success(`${formatNumber(result.inserted)} contatos importados`);
      if (result.failed)
        toast.error(`${formatNumber(result.failed)} não entraram: ${result.errors[0] ?? ""}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  const blocked = Boolean(parsed?.missingHeaders.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar contatos</DialogTitle>
          <DialogDescription>
            Planilha CSV com as colunas {CSV_HEADERS.join(", ")}. Tags separadas por “|”. Quem já
            existe (mesmo telefone ou e-mail) é ignorado. Com data_compra preenchida (dia/mês/ano) a
            pessoa entra como cliente e os prazos de arrependimento, garantia e recompra contam
            dessa data, sem mandar mensagem de boas-vindas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <label className="cursor-pointer">
              <FileUp aria-hidden />
              {fileName ? "Trocar arquivo" : "Escolher arquivo"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={onFile}
                disabled={running}
              />
            </label>
          </Button>
          <Button variant="ghost" onClick={() => downloadText("modelo-contatos.csv", CSV_TEMPLATE)}>
            <Download aria-hidden />
            Baixar modelo
          </Button>
          {fileName && (
            <span className="truncate text-[13px] text-muted-foreground">{fileName}</span>
          )}
        </div>

        {parsed && <ImportPreview parsed={parsed} />}
        {report && <ImportResult report={report} />}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            {report ? "Fechar" : "Cancelar"}
          </Button>
          {!report && (
            <Button onClick={run} disabled={!parsed?.valid.length || blocked || running}>
              {running && <Loader2 className="animate-spin" aria-hidden />}
              Importar {parsed ? formatNumber(parsed.valid.length) : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportPreview({ parsed }: { parsed: ParsedImport }) {
  if (parsed.missingHeaders.length) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-hot-line bg-hot-soft p-3 text-[13px] text-hot-fg">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />O arquivo precisa de pelo
        menos uma destas colunas: nome, telefone ou email.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        <strong className="text-foreground tabular-nums">
          {formatNumber(parsed.valid.length)}
        </strong>{" "}
        linhas prontas
        {parsed.invalid.length > 0 && (
          <>
            {" · "}
            <strong className="text-danger tabular-nums">
              {formatNumber(parsed.invalid.length)}
            </strong>{" "}
            com problema
          </>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-[12px]">
          <caption className="sr-only">Prévia das 5 primeiras linhas</caption>
          <thead className="bg-surface-2 text-subtle">
            <tr>
              {CSV_HEADERS.map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.preview.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {CSV_HEADERS.map((h) => (
                  <td key={h} className="max-w-40 truncate px-2 py-1.5">
                    {row[h] || <span className="text-subtle">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.invalid.length > 0 && (
        <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[12px] text-danger">
          {parsed.invalid.slice(0, 50).map((e) => (
            <li key={e.line}>
              Linha {e.line}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportResult({ report }: { report: ImportReport }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-[13px]"
      role="status"
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
      <p>
        <strong className="tabular-nums">{formatNumber(report.inserted)}</strong> entraram,{" "}
        <strong className="tabular-nums">{formatNumber(report.duplicates)}</strong> já existiam e{" "}
        <strong className="tabular-nums">{formatNumber(report.failed)}</strong> deram erro.
        {report.errors[0] && <span className="block text-danger">{report.errors[0]}</span>}
      </p>
    </div>
  );
}
