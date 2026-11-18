import { type ReactNode } from "react";

import { ExportContext, Setter } from "./export-csv";

export function ReportExportProvider({
  onChange,
  children,
}: {
  onChange: Setter;
  children: ReactNode;
}) {
  return <ExportContext.Provider value={onChange}>{children}</ExportContext.Provider>;
}
