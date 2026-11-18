import { formatMoney, formatNumber } from "@/lib/format";

export function fmtMetric(metric: string, v: number): string {
  return metric === "revenue" ? formatMoney(v, true) : formatNumber(v);
}
