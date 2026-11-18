// O atendente de IA pela conversa: criar, ligar, desligar, renomear, mudar saudação, tom e
// orientações, e testar ali mesmo como se fosse um cliente. Usa o mesmo caminho do passo da tela.
import { admin } from "@/backend/http.server";

import {
  addOwnerRules,
  ownerRules,
  removeOwnerRule,
  setHandoffRule,
  setUnknownRule,
} from "../agent-instructions";
import { boolArg, s, type Runner } from "../runner-types";

const ROLE = "post_sale";

async function findAgent(accountId: string) {
  const { data } = await admin()
    .from("ai_agents")
    .select("id, name, status, tone, instructions, handoff_message")
    .eq("account_id", accountId)
    .neq("role", "supervisor")
    .order("created_at", { ascending: true })
    .limit(20);
  const list = data ?? [];
  return list.find((a) => a.status === "active") ?? list[0] ?? null;
}

function strings(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim())
    return v
      .split(/\n|;/)
      .map((x) => x.trim())
      .filter(Boolean);
  return [];
}

export const AGENT_RUNNERS: Record<string, Runner> = {
  async configurar_atendente(ctx, a) {
    const db = admin();
    const steps = await import("../steps.server");
    const name = s(a["nome"], 60);
    const greeting = s(a["saudacao"], 300);
    const tone = s(a["tom"], 300);
    const on = boolArg(a["ligado"]);
    const add = strings(a["orientacoes"]);
    const remove = s(a["tirar_orientacao"], 200);
    const unknown = s(a["quando_nao_sabe"], 400);
    const handoff = s(a["passar_para_humano"], 400);
    const handoffMessage = s(a["mensagem_ao_passar"], 600);
    const done: string[] = [];

    let agent = await findAgent(ctx.caller.accountId);
    if (!agent) {
      if (on === false) return { content: "Ainda não existe atendente: não há o que desligar." };
      // cria pelo modelo pronto de pós-venda, já no WhatsApp e ligado
      await steps.createPostSaleAgent(ctx.caller, { name, greeting });
      agent = await findAgent(ctx.caller.accountId);
      if (!agent)
        throw new Error("não consegui criar o atendente agora. Tente de novo em instantes");
      done.push(`atendente criado e ligado${name ? ` com o nome ${name}` : ""}`);
      if (greeting) done.push("saudação definida");
    } else {
      if (name && name !== agent.name) done.push(`nome: ${name}`);
      if (greeting) done.push("saudação nova");
    }

    let instructions = agent.instructions;
    if (greeting && !done.includes("saudação definida"))
      instructions = steps.withGreeting(instructions, greeting);
    if (add.length) {
      instructions = addOwnerRules(instructions, add);
      done.push(`${add.length} orientação(ões) acrescentada(s)`);
    }
    if (remove) {
      const r = removeOwnerRule(instructions, remove);
      if (!r.removed)
        throw new Error(
          `não achei orientação com "${remove}". As atuais são: ${ownerRules(instructions).join(" | ") || "nenhuma"}`,
        );
      instructions = r.text;
      done.push(`${r.removed} orientação(ões) tirada(s)`);
    }
    if (unknown) {
      instructions = setUnknownRule(instructions, unknown);
      done.push("o que fazer quando não sabe");
    }
    if (handoff) {
      instructions = setHandoffRule(instructions, handoff);
      done.push("quando passar para uma pessoa");
    }

    const patch: {
      name?: string;
      instructions?: string;
      tone?: string;
      handoff_message?: string;
      status?: "active" | "paused";
    } = {};
    if (name && name !== agent.name) patch.name = name;
    if (instructions !== agent.instructions) patch.instructions = instructions;
    if (tone && tone !== agent.tone) {
      patch.tone = tone;
      done.push(`tom: ${tone}`);
    }
    if (handoffMessage) {
      patch.handoff_message = handoffMessage;
      done.push("mensagem ao passar para uma pessoa");
    }
    if (on === true && agent.status !== "active") {
      patch.status = "active";
      done.push("ligado");
    }
    if (on === false && agent.status === "active") {
      patch.status = "paused";
      done.push("desligado (as conversas ficam só com a equipe)");
    }
    if (Object.keys(patch).length) {
      const { error } = await db
        .from("ai_agents")
        .update(patch)
        .eq("id", agent.id)
        .eq("account_id", ctx.caller.accountId);
      if (error) throw new Error(`não consegui salvar o atendente: ${error.message}`);
    }
    if (on === true) {
      // a IA só responde em canal com a resposta automática ligada
      await db
        .from("channels")
        .update({ ai_enabled: true })
        .eq("account_id", ctx.caller.accountId)
        .eq("platform", "whatsapp");
    }
    const finalName = patch.name ?? agent.name;
    const finalStatus = patch.status ?? agent.status;
    if (!done.length)
      return {
        content: `Nada mudou. ${finalName} está ${finalStatus === "active" ? "ligado" : "desligado"}; tom: ${agent.tone}; orientações: ${ownerRules(agent.instructions).join(" | ") || "nenhuma além do modelo"}.`,
      };
    return {
      content: `${finalName}: ${done.join("; ")}. Estado: ${finalStatus === "active" ? "ligado" : "desligado"}. Vale a partir da próxima mensagem de cliente.`,
      action: {
        kind: "done",
        label: `${finalName}: ${done.join("; ")}`.slice(0, 160),
        tool: "configurar_atendente",
      },
    };
  },

  async testar_atendente(ctx, a) {
    const question = s(a["pergunta"], 1000);
    if (question.length < 2)
      throw new Error("faltou a pergunta de teste (o que o cliente escreveria)");
    const agent = await findAgent(ctx.caller.accountId);
    if (!agent)
      throw new Error("ainda não existe atendente: crie com configurar_atendente (ligado=true)");
    const { simulate } = await import("@/backend/agents/orchestrator.server");
    const r = await Promise.race([
      simulate(ctx.caller.accountId, agent.id, [{ role: "user", content: question }]),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("o atendente demorou demais para responder ao teste")),
          40_000,
        ),
      ),
    ]);
    const reply =
      r.reply ||
      (r.action === "handoff"
        ? "(o atendente passaria esta conversa para uma pessoa da equipe)"
        : "(sem resposta)");
    return {
      content: `Teste feito, nada foi enviado a cliente. Pergunta: "${question}". Resposta de ${agent.name}: "${reply}". A resposta está na tela: não repita o texto inteiro, pergunte se ficou bom ou o que ajustar.`,
      block: {
        kind: "cards",
        title: "Teste do atendente",
        hint: "Só um teste: nenhuma mensagem saiu para cliente.",
        cards: [
          { title: "Cliente", text: question.slice(0, 240), icon: "whatsapp" },
          { title: agent.name.slice(0, 80), text: reply.slice(0, 700), icon: "agente" },
        ],
      },
    };
  },
};
