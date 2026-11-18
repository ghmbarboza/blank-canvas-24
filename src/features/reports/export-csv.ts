import { createContext, useContext, useEffect } from "react";
import { toCsv } from "./lib";

// Cada relatório registra a tabela que o botão "Exportar" do cabeçalho baixa em CSV.
export interface ExportTable {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}

export type Setter = (t: ExportTable | null) => void;

export const ExportContext = createContext<Setter | null>(null);

export function useReportExport(table: ExportTable | null) {
  const set = useContext(ExportContext);
  const signature = table ? JSON.stringify(table) : "";
  useEffect(() => {
    if (!set) return;
    set(table);
    return () => set(null);
    // A assinatura em texto evita registrar de novo a cada render com o mesmo conteúdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, signature]);
}

export function downloadCsv(t: ExportTable) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([toCsv(t.headers, t.rows)], { type: "text/csv;charset=utf-8" }),
  );
  a.href = url;
  a.download = `${t.filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
