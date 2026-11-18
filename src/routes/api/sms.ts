import { createFileRoute } from "@tanstack/react-router";

// SMS pela Zadarma (a telefonia da Central de CS é só a Zadarma, decisão de 04/11/2026).
// action "connect" (admin): cria ou atualiza o canal SMS da conta com o remetente liberado.
// sem action (membro): responde uma conversa SMS pela Caixa de entrada.
export const Route = createFileRoute("/api/sms")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const b = await h.readJson<{
            accountId?: string;
            action?: string;
            name?: string;
            sender?: string;
            conversationId?: string;
            text?: string;
          }>(req);
          const db = h.admin();

          if (b.action === "connect") {
            const caller = await h.requireMember(req, b.accountId, "admin");
            const { smsSender } = await import("@/backend/providers/zadarma-sms");
            const sender = smsSender(b.sender);
            if (!sender)
              throw new h.HttpError(
                400,
                "Informe o número virtual da Zadarma que envia o SMS, ex.: +5548999990000",
                "bad_sender",
              );
            const { zadarmaCreds } = await import("@/backend/telephony/core.server");
            const { zadarmaSmsSenders } = await import("@/backend/providers/zadarma.server");
            const creds = await zadarmaCreds(caller.accountId);
            let senders: string[] = [];
            try {
              senders = (await zadarmaSmsSenders(creds, sender.replace("+", ""))).senders ?? [];
            } catch (err) {
              throw new h.HttpError(
                422,
                err instanceof Error ? err.message : "A Zadarma recusou",
                "zadarma",
              );
            }
            // só conecta número que a própria Zadarma da conta lista como remetente (falha fechada)
            const digits = sender.replace(/\D/g, "");
            if (!senders.some((s) => s.replace(/\D/g, "") === digits))
              throw new h.HttpError(
                422,
                senders.length
                  ? `Este número não está liberado como remetente de SMS na sua Zadarma. Liberados: ${senders.join(", ")}`
                  : "A sua Zadarma não liberou nenhum remetente de SMS para este número. Confira o número em my.zadarma.com › Números.",
                "sender_not_allowed",
              );
            // o número é único na Central de CS inteiro: nunca toma o canal de outra conta
            const { data: existing } = await db
              .from("channels")
              .select("id, account_id")
              .eq("provider", "zadarma")
              .eq("external_id", sender)
              .maybeSingle();
            if (existing && existing.account_id !== caller.accountId)
              throw new h.HttpError(409, "Este número já está conectado em outra conta", "taken");
            const name =
              String(b.name ?? "")
                .trim()
                .slice(0, 80) || `SMS ${sender}`;
            const row = { name, status: "connected", status_detail: null, config: { sender } };
            const { data, error } = existing
              ? await db.from("channels").update(row).eq("id", existing.id).select("id").single()
              : await db
                  .from("channels")
                  .insert({
                    ...row,
                    account_id: caller.accountId,
                    provider: "zadarma",
                    platform: "sms",
                    external_id: sender,
                    is_shared: true,
                  })
                  .select("id")
                  .single();
            if (error || !data) throw new h.HttpError(500, error?.message ?? "canal", "save");
            return h.json({
              id: data.id,
              webhookUrl: `${h.appBaseUrl(req)}/api/public/zadarma?a=${caller.accountId}`,
            });
          }

          // Resposta da equipe numa conversa SMS.
          const caller = await h.requireMember(req, b.accountId, "member");
          if (!h.isUuid(b.conversationId))
            throw new h.HttpError(400, "Conversa inválida", "bad_conversation");
          const text = String(b.text ?? "").trim();
          if (!text) throw new h.HttpError(400, "Mensagem vazia", "empty");
          if (text.length > 600)
            throw new h.HttpError(400, "SMS longo demais (até 600 caracteres)", "too_long");
          await h.rateLimit(`sms:${caller.userId}`, 60, 60);
          const { data: conv } = await db
            .from("conversations")
            .select(
              "id, assignee_user_id, channels!inner(provider, platform, owner_user_id, is_shared)",
            )
            .eq("id", b.conversationId)
            .eq("account_id", caller.accountId)
            .maybeSingle();
          if (!conv) throw new h.HttpError(404, "Conversa não encontrada", "not_found");
          const ch = conv.channels as unknown as {
            provider: string;
            platform: string;
            owner_user_id: string | null;
            is_shared: boolean;
          };
          if (ch.provider !== "zadarma" || ch.platform !== "sms")
            throw new h.HttpError(409, "Esta conversa não é de SMS", "not_sms");
          const isMgr = ["owner", "admin", "manager"].includes(caller.role);
          if (
            !isMgr &&
            !ch.is_shared &&
            ch.owner_user_id !== caller.userId &&
            conv.assignee_user_id !== caller.userId
          )
            throw new h.HttpError(403, "Canal de outro vendedor", "forbidden");
          const { sendToConversation } = await import("@/backend/support/channel-send.server");
          let res: { messageId: string };
          try {
            res = await sendToConversation(conv.id, {
              text,
              senderType: "user",
              senderUserId: caller.userId,
            });
          } catch (err) {
            throw new h.HttpError(
              502,
              err instanceof Error ? err.message : "O SMS não saiu",
              "provider_error",
            );
          }
          if (!conv.assignee_user_id)
            await db
              .from("conversations")
              .update({ assignee_user_id: caller.userId })
              .eq("id", conv.id);
          return h.json({ ok: true, messageId: res.messageId });
        })(ctx);
      },
    },
  },
});
