// Link público "gerenciar reunião" (confirmar, remarcar, cancelar) assinado com HMAC-SHA256.
// Puro: não lê banco. Formato compacto para caber no WhatsApp: <id 32 hex><validade base36>.<mac 22>
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ManageClaim {
  meetingId: string;
  exp: number; // epoch ms
}

export const MANAGE_TOKEN_RE = /^[a-f0-9]{32}[a-z0-9]{6,10}\.[A-Za-z0-9_-]{22}$/;

function mac(body: string, secret: string): string {
  return createHmac("sha256", `meeting-manage:${secret}`)
    .update(body)
    .digest("base64url")
    .slice(0, 22);
}

export function signManageToken(c: ManageClaim, secret: string): string {
  const hex = c.meetingId.replace(/-/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hex)) throw new Error("reunião inválida");
  const body = `${hex}${Math.floor(c.exp / 1000).toString(36)}`;
  return `${body}.${mac(body, secret)}`;
}

export function verifyManageToken(
  token: string,
  secret: string,
  now = Date.now(),
): ManageClaim | null {
  if (!MANAGE_TOKEN_RE.test(token)) return null;
  const [body, got] = token.split(".") as [string, string];
  const expected = mac(body, secret);
  if (!timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return null;
  const exp = parseInt(body.slice(32), 36) * 1000;
  if (!Number.isFinite(exp) || exp < now) return null;
  const h = body.slice(0, 32);
  const meetingId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { meetingId, exp };
}

/** Validade: 30 dias depois do fim previsto (o link de remarcar vale também após um não comparecimento). */
export function manageExpiry(scheduledEnd: string | null, now = Date.now()): number {
  const end = scheduledEnd ? new Date(scheduledEnd).getTime() : now;
  return Math.max(now, Number.isFinite(end) ? end : now) + 30 * 86_400_000;
}

export interface GuestActions {
  canConfirm: boolean;
  canCancel: boolean;
  canReschedule: boolean;
}

const MAX_RESCHEDULES = 3;

/** O que o convidado pode fazer agora, pelo estado e horário da reunião. */
export function guestActions(
  m: { status: string; scheduled_start: string | null; reschedule_count?: number | null },
  now = Date.now(),
): GuestActions {
  const start = m.scheduled_start ? new Date(m.scheduled_start).getTime() : NaN;
  const ahead = Number.isFinite(start) && start > now;
  const underLimit = (m.reschedule_count ?? 0) < MAX_RESCHEDULES;
  return {
    canConfirm: m.status === "scheduled" && ahead,
    canCancel: m.status === "scheduled" && ahead,
    canReschedule: underLimit && ((m.status === "scheduled" && ahead) || m.status === "no_show"),
  };
}
