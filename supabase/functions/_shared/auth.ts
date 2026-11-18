import { adminClient } from "./supabase.ts";
import { HttpError } from "./http.ts";

export type Role = "owner" | "admin" | "manager" | "agent" | "seller";
export interface Caller {
  userId: string;
  accountId: string;
  role: Role;
}

const MANAGERS: Role[] = ["owner", "admin", "manager"];
const ADMINS: Role[] = ["owner", "admin"];

// Valida o JWT do usuário e a participação ativa na conta pedida.
export async function requireMember(
  req: Request,
  accountId: string | undefined,
  allowed: "member" | "manager" | "admin" = "member",
): Promise<Caller> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sessão ausente", "unauthenticated");
  if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) {
    throw new HttpError(400, "accountId inválido", "bad_account");
  }
  const db = adminClient();
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida", "unauthenticated");

  const { data: m } = await db
    .from("memberships")
    .select("role, is_active")
    .eq("account_id", accountId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!m || !m.is_active) throw new HttpError(403, "Sem acesso a esta conta", "forbidden");
  const role = m.role as Role;
  if (allowed === "manager" && !MANAGERS.includes(role))
    throw new HttpError(403, "Apenas gestores", "forbidden");
  if (allowed === "admin" && !ADMINS.includes(role))
    throw new HttpError(403, "Apenas administradores", "forbidden");
  return { userId: userData.user.id, accountId, role };
}

export function isManager(role: Role) {
  return MANAGERS.includes(role);
}
