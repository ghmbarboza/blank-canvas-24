// Equipe pela conversa: listar quem tem acesso (e os convites em aberto) e mudar o papel de alguém.
// Convidar já existe (convidar_pessoa): gera um link copiável, sem depender de e-mail.
import { admin } from "@/backend/http.server";

import { s, type Runner } from "../runner-types";

const ROLE_LABEL: Record<string, string> = {
  owner: "dono",
  admin: "administrador",
  manager: "gestor",
  agent: "atendente",
  seller: "vendedor",
};
const ROLE_FROM: Record<string, string> = {
  admin: "admin",
  administrador: "admin",
  manager: "manager",
  gestor: "manager",
  gerente: "manager",
  agent: "agent",
  atendente: "agent",
  seller: "seller",
  vendedor: "seller",
};

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
}

async function members(accountId: string): Promise<Member[]> {
  const db = admin();
  const { data, error } = await db
    .from("memberships")
    .select("user_id, role, display_name")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .limit(50);
  if (error) throw new Error(error.message);
  return Promise.all(
    (data ?? []).map(async (m) => {
      const u = await db.auth.admin.getUserById(m.user_id).catch(() => null);
      const email = u?.data.user?.email ?? "";
      const meta = (u?.data.user?.user_metadata ?? {}) as { full_name?: string };
      return {
        userId: m.user_id,
        name: m.display_name || meta.full_name || email.split("@")[0] || "sem nome",
        email,
        role: m.role,
      };
    }),
  );
}

export const TEAM_RUNNERS: Record<string, Runner> = {
  async listar_equipe(ctx) {
    const db = admin();
    const [list, invites] = await Promise.all([
      members(ctx.caller.accountId),
      db
        .from("invites")
        .select("email, role, expires_at")
        .eq("account_id", ctx.caller.accountId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(30),
    ]);
    const pending = invites.data ?? [];
    return {
      content: [
        ...list.map(
          (m) => `- ${m.name} (${m.email || "sem e-mail"}): ${ROLE_LABEL[m.role] ?? m.role}`,
        ),
        pending.length
          ? `Convites em aberto: ${pending.map((i) => `${i.email} (${ROLE_LABEL[i.role] ?? i.role})`).join(", ")}`
          : "Nenhum convite em aberto.",
      ].join("\n"),
      block: {
        kind: "cards",
        title: "Equipe",
        cards: [
          ...list.slice(0, 5).map((m) => ({
            title: m.name.slice(0, 80),
            text: `${ROLE_LABEL[m.role] ?? m.role}${m.email ? ` · ${m.email}` : ""}`,
            icon: "equipe" as const,
          })),
          ...(pending.length
            ? [
                {
                  title: `${pending.length} convite(s) em aberto`,
                  text: pending
                    .map((i) => i.email)
                    .join(", ")
                    .slice(0, 240),
                  icon: "email" as const,
                },
              ]
            : []),
        ],
      },
    };
  },

  async mudar_papel(ctx, a) {
    const who = s(a["pessoa"], 200).toLowerCase();
    const role = ROLE_FROM[s(a["papel"], 20).toLowerCase()];
    if (!who) throw new Error("diga quem (nome ou e-mail da pessoa)");
    if (!role) throw new Error("papel inválido: use administrador, gestor, atendente ou vendedor");
    const list = await members(ctx.caller.accountId);
    const hits = list.filter((m) => m.email.toLowerCase() === who || m.name.toLowerCase() === who);
    const loose = hits.length
      ? hits
      : list.filter(
          (m) => m.email.toLowerCase().includes(who) || m.name.toLowerCase().includes(who),
        );
    if (!loose.length) {
      // ainda não entrou: muda o papel do convite em aberto
      const { data: inv } = await admin()
        .from("invites")
        .update({ role: role as never })
        .eq("account_id", ctx.caller.accountId)
        .ilike("email", who)
        .is("accepted_at", null)
        .select("email");
      if (inv?.length)
        return {
          content: `${inv[0]!.email} ainda não aceitou o convite: o convite agora é de ${ROLE_LABEL[role]}.`,
          action: {
            kind: "done",
            label: `Convite de ${inv[0]!.email}: ${ROLE_LABEL[role]}`,
            tool: "mudar_papel",
          },
        };
      throw new Error(`não achei "${who}" na equipe. Use listar_equipe para ver os nomes`);
    }
    if (loose.length > 1)
      return {
        content: `Achei mais de uma pessoa: ${loose.map((m) => `${m.name} (${m.email})`).join(", ")}. Pergunte qual.`,
      };
    const m = loose[0]!;
    if (m.role === "owner") throw new Error("o papel do dono da conta não muda por aqui");
    if (m.userId === ctx.caller.userId) throw new Error("você não pode mudar o seu próprio papel");
    if (role === "admin" && ctx.caller.role !== "owner")
      throw new Error("só o dono da conta pode tornar alguém administrador");
    const { error } = await admin()
      .from("memberships")
      .update({ role: role as never })
      .eq("account_id", ctx.caller.accountId)
      .eq("user_id", m.userId);
    if (error) throw new Error(error.message);
    return {
      content: `${m.name} agora é ${ROLE_LABEL[role]}.`,
      action: { kind: "done", label: `${m.name}: ${ROLE_LABEL[role]}`, tool: "mudar_papel" },
    };
  },
};
