// Ações do call center que precisam do servidor: conferir a Zadarma (só leitura), ligar o modo
// supervisor no ramal do gestor, passo a passo da escuta/sussurro/entrada, transferência com
// apresentação (o colega recebe o resumo antes) e refazer o pós-atendimento da IA.
import { HttpError, admin, isUuid, type Caller } from "@/backend/http.server";
import type { Json } from "@/integrations/supabase/types";
import {
  zadarmaInternalInfo,
  zadarmaInternals,
  zadarmaSetSupervisor,
} from "@/backend/providers/zadarma.server";
import { zadarmaCreds } from "@/backend/telephony/core.server";
import { attendedTransferCode, superviseSteps, type SuperviseMode } from "@/features/queue/lib";

async function extensionOf(accountId: string, userId: string): Promise<string | null> {
  const { data } = await admin()
    .from("telephony_extensions")
    .select("extension, is_active")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.is_active ? data.extension : null;
}

function supervisorOn(v: number | string | undefined): boolean {
  return String(v ?? "0") === "1";
}

/** "Testar" da supervisão: lê os ramais da PABX e o modo supervisor de cada um. Não altera nada. */
export async function zadarmaCheck(caller: Caller) {
  const creds = await zadarmaCreds(caller.accountId);
  const list = await zadarmaInternals(creds);
  const { data: team } = await admin()
    .from("telephony_extensions")
    .select("user_id, extension")
    .eq("account_id", caller.accountId)
    .eq("is_active", true);
  const extensions = await Promise.all(
    (team ?? []).slice(0, 30).map(async (t) => {
      try {
        const info = await zadarmaInternalInfo(creds, t.extension);
        return {
          user_id: t.user_id,
          extension: t.extension,
          found: true,
          supervisor: supervisorOn(info.supervisor_status),
        };
      } catch {
        return { user_id: t.user_id, extension: t.extension, found: false, supervisor: false };
      }
    }),
  );
  return {
    pbx_id: list.pbx_id ?? null,
    pbx_extensions: (list.numbers ?? []).map(String),
    extensions,
  };
}

export async function supervisorEnable(caller: Caller) {
  const ext = await extensionOf(caller.accountId, caller.userId);
  if (!ext)
    throw new HttpError(
      412,
      "Você precisa de um ramal para supervisionar. Crie em Ajustes › Telefonia.",
      "no_extension",
    );
  const creds = await zadarmaCreds(caller.accountId);
  await zadarmaSetSupervisor(creds, ext, true);
  const info = await zadarmaInternalInfo(creds, ext);
  if (!supervisorOn(info.supervisor_status))
    throw new HttpError(
      502,
      "A Zadarma não confirmou o modo supervisor. Tente de novo ou ligue no painel da Zadarma.",
      "supervisor_not_set",
    );
  return { ok: true, extension: ext };
}

export async function superviseInfo(caller: Caller, body: Record<string, unknown>) {
  if (!isUuid(body["userId"])) throw new HttpError(400, "Atendente inválido", "bad_user");
  const mode =
    (["listen", "whisper", "barge"] as const).find((m) => m === body["mode"]) ?? "listen";
  const target = await extensionOf(caller.accountId, body["userId"]);
  if (!target)
    throw new HttpError(412, "Este atendente não tem ramal na Zadarma", "target_no_extension");
  const mine = await extensionOf(caller.accountId, caller.userId);
  let supervisor: boolean | null = null;
  if (mine) {
    try {
      const creds = await zadarmaCreds(caller.accountId);
      supervisor = supervisorOn((await zadarmaInternalInfo(creds, mine)).supervisor_status);
    } catch {
      supervisor = null;
    }
  }
  return {
    target_extension: target,
    my_extension: mine,
    supervisor_enabled: supervisor,
    steps: superviseSteps(target, mode as SuperviseMode),
  };
}

// Transferência com apresentação: o colega recebe o resumo na hora (aviso e "Minha fila") e o
// atendente tecla *ramal# no telefone para falar com ele antes de passar o cliente.
export async function transferBrief(caller: Caller, body: Record<string, unknown>) {
  if (!isUuid(body["workItemId"]) || !isUuid(body["targetUserId"]))
    throw new HttpError(400, "Dados da transferência incompletos", "bad_request");
  const note = typeof body["note"] === "string" ? body["note"].trim().slice(0, 1500) : "";
  if (note.length < 5)
    throw new HttpError(422, "Escreva um resumo curto para o colega", "no_summary");
  const db = admin();
  const { data: w } = await db
    .from("work_items")
    .select("id, account_id, assigned_user_id, subject, metadata, contact_id")
    .eq("id", body["workItemId"])
    .maybeSingle();
  if (!w || w.account_id !== caller.accountId)
    throw new HttpError(404, "Atendimento não encontrado", "not_found");
  if (w.assigned_user_id !== caller.userId && !["owner", "admin", "manager"].includes(caller.role))
    throw new HttpError(403, "Só quem está atendendo pode transferir", "forbidden");
  const { data: m } = await db
    .from("memberships")
    .select("display_name, is_active")
    .eq("account_id", caller.accountId)
    .eq("user_id", body["targetUserId"])
    .maybeSingle();
  if (!m?.is_active) throw new HttpError(404, "Colega não encontrado nesta conta", "not_found");
  const target = await extensionOf(caller.accountId, body["targetUserId"]);
  const meta = (w.metadata ?? {}) as Record<string, Json>;
  const transfers: Json[] = Array.isArray(meta["transfers"]) ? meta["transfers"] : [];
  await db
    .from("work_items")
    .update({
      summary: note,
      metadata: {
        ...meta,
        transfers: [
          ...transfers,
          { from: caller.userId, to: String(body["targetUserId"]), at: new Date().toISOString() },
        ],
      },
    })
    .eq("id", w.id);
  await db.rpc("notify_user", {
    _account: caller.accountId,
    _user: body["targetUserId"],
    _kind: "transfer_brief",
    _title: `Vai chegar uma transferência: ${w.subject ?? "atendimento"}`,
    _body: note,
    _link: "/fila",
  });
  return {
    ok: true,
    target_name: m.display_name ?? "colega",
    target_extension: target,
    code: target ? attendedTransferCode(target) : null,
  };
}

export async function regenerateWrap(caller: Caller, body: Record<string, unknown>) {
  if (!isUuid(body["workItemId"])) throw new HttpError(400, "Atendimento inválido", "bad_request");
  const db = admin();
  const { data: w } = await db
    .from("work_items")
    .select("id, account_id, status")
    .eq("id", body["workItemId"])
    .maybeSingle();
  if (!w || w.account_id !== caller.accountId)
    throw new HttpError(404, "Atendimento não encontrado", "not_found");
  if (w.status !== "wrap_up")
    throw new HttpError(409, "Este atendimento não está em pós-atendimento", "not_wrap_up");
  await db.rpc("enqueue_job", {
    _account: caller.accountId,
    _kind: "workitem.wrapup",
    _payload: { work_item_id: w.id, force: true },
    _dedupe: `workitem.wrapup:${w.id}:${Date.now()}`,
  });
  return { ok: true };
}
