// Agenda pela Zernio: as caixas Google e Microsoft conectadas na Central da Zernio (OAuth feito
// pela própria Zernio) bloqueiam os horários ocupados de quem atende. A caixa é ligada à pessoa
// pelo e-mail: o mesmo e-mail do login no Vínculo e da conta Google/Microsoft conectada.
import { admin } from "@/backend/http.server";
import { listAccounts, zernio, zernioKey } from "@/backend/providers/zernio-client.server";
import { WORKSPACE_PLATFORMS } from "@/features/channels/zernio-catalog";

export interface BusyBlock {
  start: number;
  end: number;
}

/** A Zernio aceita até 10 caixas por consulta. */
const FREE_BUSY_BATCH = 10;

interface FreeBusyResponse {
  data?: { accountId: string; busy?: { start: string; end: string }[] }[];
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Junta a caixa da Zernio a cada pessoa pelo e-mail (sem rede, testável). */
export function matchMailboxes(
  mailboxes: { id: string; email: string }[],
  users: { id: string; email: string }[],
): Map<string, string[]> {
  const byEmail = new Map<string, string>();
  for (const u of users) if (norm(u.email)) byEmail.set(norm(u.email), u.id);
  const out = new Map<string, string[]>();
  for (const m of mailboxes) {
    const userId = byEmail.get(norm(m.email));
    if (!userId) continue;
    out.set(userId, [...(out.get(userId) ?? []), m.id]);
  }
  return out;
}

/** Converte a resposta da Zernio em blocos por caixa, ignorando horário inválido. */
export function parseFreeBusy(r: FreeBusyResponse): Map<string, BusyBlock[]> {
  const out = new Map<string, BusyBlock[]>();
  for (const row of r.data ?? []) {
    const blocks = (row.busy ?? [])
      .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
      .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
    out.set(row.accountId, blocks);
  }
  return out;
}

async function emailsOf(userIds: string[]): Promise<{ id: string; email: string }[]> {
  const db = admin();
  const rows = await Promise.all(
    userIds.map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      return { id, email: data.user?.email ?? "" };
    }),
  );
  return rows.filter((r) => r.email);
}

/**
 * Ocupado de cada pessoa pelas agendas Google/Microsoft da Zernio. Sem chave, sem caixa ou com a
 * Zernio fora do ar, devolve vazio: o agendamento segue com a agenda do próprio Vínculo.
 */
export async function zernioBusy(
  accountId: string,
  users: string[],
  from: Date,
  to: Date,
): Promise<Map<string, BusyBlock[]>> {
  const result = new Map<string, BusyBlock[]>();
  if (!users.length) return result;
  try {
    const key = await zernioKey(accountId);
    if (!key) return result;
    const mailboxes = (await listAccounts(key))
      .filter((a) => WORKSPACE_PLATFORMS.has(a.platform) && a.isActive !== false)
      .map((a) => ({ id: a._id, email: a.username ?? "" }))
      .filter((m) => m.email.includes("@"));
    if (!mailboxes.length) return result;
    const owners = matchMailboxes(mailboxes, await emailsOf(users));
    const ids = [...owners.values()].flat();
    const busyByMailbox = new Map<string, BusyBlock[]>();
    for (let i = 0; i < ids.length; i += FREE_BUSY_BATCH) {
      const r = await zernio<FreeBusyResponse>(key, "/v1/calendar/free-busy", {
        method: "POST",
        body: {
          accountIds: ids.slice(i, i + FREE_BUSY_BATCH),
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });
      for (const [id, blocks] of parseFreeBusy(r)) busyByMailbox.set(id, blocks);
    }
    for (const [userId, boxes] of owners)
      result.set(
        userId,
        boxes.flatMap((b) => busyByMailbox.get(b) ?? []),
      );
  } catch (err) {
    console.warn("[agenda zernio] ocupado indisponível", err instanceof Error ? err.message : err);
  }
  return result;
}
