// Relatório salvo com envio semanal: roda o construtor e manda por e-mail (job email.send) a cada destinatário.
import { admin, appBaseUrl } from "@/backend/http.server";
import { normalizeConfig, reportEmailHtml, type ReportRow } from "@/features/reports/lib";
import { registerJob } from "../registry.server";

registerJob("report.send", async (job) => {
  const reportId = (job.payload as { report_id?: string })?.report_id;
  if (!job.account_id || !reportId) throw new Error("payload incompleto");
  const db = admin();
  const { data: report } = await db
    .from("saved_reports")
    .select("*")
    .eq("id", reportId)
    .eq("account_id", job.account_id)
    .maybeSingle();
  if (!report || report.schedule !== "weekly" || report.recipients.length === 0)
    return { skipped: true };
  const config = normalizeConfig(report.config as never);
  const { data, error } = await db.rpc("run_report", {
    _account: job.account_id,
    _config: config as never,
  });
  if (error) throw new Error(`run_report: ${error.message}`);
  const rows = ((data ?? []) as ReportRow[]).map((r) => ({ ...r, value: Number(r.value) }));
  const html = reportEmailHtml(
    report.name,
    config,
    rows,
    `${appBaseUrl()}/relatorios?aba=construtor&relatorio=${report.id}`,
  );
  for (const to of report.recipients.slice(0, 20)) {
    await db.rpc("enqueue_job", {
      _account: job.account_id,
      _kind: "email.send",
      _payload: {
        to_email: to,
        subject: `Relatório: ${report.name}`,
        html,
        category: "transactional",
      },
      _dedupe: `report-mail:${report.id}:${to}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  await db
    .from("saved_reports")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", report.id);
  return { sent: report.recipients.length };
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
