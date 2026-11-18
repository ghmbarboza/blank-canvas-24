// A conversa com a Nexa no modal. O histórico gravado vem do banco; a rodada em andamento
// vem do stream (useChat do AI SDK). Quando a rodada termina e o banco já tem a resposta,
// o que veio do stream sai e fica só o gravado: uma fonte de verdade, sem duplicar.
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StageAction, StageBlock, StoredPart } from "@/backend/setup-agent/stage";
import { refreshAfterTurn, useSetupMessages } from "@/features/setup-chat/api";
import { supabase } from "@/integrations/supabase/client";
import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";
import { BRAND } from "@/lib/brand";

export interface NexaTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks: StageBlock[];
  actions: StageAction[];
  live: boolean;
}

// o que a Nexa está fazendo enquanto a ferramenta roda, em palavras de gente
const WORKING: Record<string, string> = {
  ver_progresso: "Conferindo o que já está pronto",
  guardar_informacao: "Anotando",
  cadastrar_produto: "Cadastrando no catálogo",
  apagar_informacao: "Apagando o que mudou",
  salvar_empresa: "Salvando a empresa",
  ler_site: "Lendo o site",
  pesquisar_web: "Pesquisando na internet",
  guardar_conhecimento: "Guardando na biblioteca",
  conectar_integracao: "Guardando a chave no cofre",
  conectar_zernio: "Conectando a Zernio",
  link_whatsapp: "Preparando o WhatsApp",
  conferir_zernio: "Conferindo o que está conectado na Zernio",
  link_zernio: "Preparando o cadastro na Zernio",
  link_ferramenta: "Preparando a conexão",
  importar_drive: "Importando do Drive",
  criar_agente: "Criando o agente",
  convidar_pessoa: "Mandando o convite",
  registrar_desejo: "Anotando o seu pedido",
  ligar_recurso: "Ligando o recurso",
  escolher_recursos: "Ajustando o menu",
  abrir_tela: "Preparando a tela",
  mostrar_opcoes: "Montando as opções",
  mostrar_formulario: "Montando o formulário",
  mostrar_cartoes: "Montando o resumo",
  mostrar_etapas: "Montando o plano",
};

interface ToolPartLike {
  type: string;
  state?: string;
  output?: { ok?: boolean; bloco?: StageBlock; acao?: StageAction };
}

function fromLive(m: UIMessage): NexaTurn {
  const text: string[] = [];
  const blocks: StageBlock[] = [];
  const actions: StageAction[] = [];
  for (const p of m.parts as ToolPartLike[]) {
    if (p.type === "text") text.push((p as unknown as { text: string }).text);
    if (!p.type.startsWith("tool-") || p.state !== "output-available") continue;
    if (p.output?.bloco) blocks.push(p.output.bloco);
    if (p.output?.acao) actions.push(p.output.acao);
  }
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    text: text.join("\n").trim(),
    blocks,
    actions,
    live: true,
  };
}

type StoredRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: StageAction[];
  parts?: StoredPart[];
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Uma linha fora do formato em setup_messages não pode derrubar o app: o que não for parte ou
// ação reconhecível é descartado e o resto da conversa segue.
export function fromStored(m: StoredRow): NexaTurn {
  const raw: unknown = m.parts;
  const parts = (Array.isArray(raw) ? raw : []).filter(
    (p): p is StoredPart => isObj(p) && typeof p["type"] === "string",
  );
  const legacy: unknown = m.actions;
  return {
    id: String(m.id),
    role: m.role === "user" ? "user" : "assistant",
    text: typeof m.content === "string" ? m.content : "",
    blocks: parts.flatMap((p) => (p.type === "block" && isObj(p.block) ? [p.block] : [])),
    // respostas antigas (antes do palco) só têm actions
    actions: parts.length
      ? parts.flatMap((p) => (p.type === "action" && isObj(p.action) ? [p.action] : []))
      : Array.isArray(legacy)
        ? legacy.filter((a): a is StageAction => isObj(a))
        : [],
    live: false,
  };
}

/** Ferramenta rodando agora na rodada ao vivo (para a fala da esquerda mostrar). */
function workingOf(m: UIMessage | undefined): string | null {
  if (!m || m.role !== "assistant") return null;
  const running = [...(m.parts as ToolPartLike[])]
    .reverse()
    .find(
      (p) =>
        p.type.startsWith("tool-") && p.state !== "output-available" && p.state !== "output-error",
    );
  return running ? (WORKING[running.type.slice(5)] ?? "Trabalhando") : null;
}

export function useNexa(accountId: string, person: string) {
  const qc = useQueryClient();
  const stored = useSetupMessages(accountId);
  // o histórico gravado é lido uma vez e congelado: a rodada nova vive só no stream. Trocar a
  // cópia do stream pela gravada fazia a conversa piscar, pular e perder a escolha feita.
  const [history, setHistory] = useState<NexaTurn[] | null>(null);
  const starting = useRef(false);

  useEffect(() => {
    if (history || !stored.data) return;
    const turns = stored.data.map((m) => fromStored(m as StoredRow));
    setHistory(turns);
    if (turns.length || starting.current) return;
    // primeiro uso: a Nexa abre a conversa no começo do roteiro, sem esperar a IA
    starting.current = true;
    type Stored = StoredRow;
    void callApi<{ message: Stored | null; messages?: Stored[] }>("/api/setup-chat", {
      accountId,
      action: "start",
      name: person,
    })
      .then((r) => {
        // a abertura vem em duas mensagens curtas (cumprimento + a pergunta do passo)
        const list = r.messages?.length ? r.messages : r.message ? [r.message] : [];
        if (list.length) setHistory((h) => [...(h ?? []), ...list.map(fromStored)]);
      })
      .catch((e: unknown) => {
        starting.current = false;
        toast.error(
          `A ${BRAND.assistant} não conseguiu começar a conversa (${errorMessage(e)}). Feche e abra de novo; se continuar, recarregue a página.`,
        );
      });
  }, [history, stored.data, accountId, person]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/nexa",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        // o servidor lê o histórico do banco: do navegador só vai a fala atual
        prepareSendMessagesRequest: ({ messages, headers, trigger }) => {
          const last = [...messages].reverse().find((m) => m.role === "user");
          const text = (last?.parts ?? [])
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("\n");
          const retry = trigger === "regenerate-message";
          return { body: { accountId, text, retry }, ...(headers ? { headers } : {}) };
        },
      }),
    [accountId],
  );

  const chat = useChat({
    id: `nexa-${accountId}`,
    transport,
    onFinish: () => refreshAfterTurn(qc, accountId),
    onError: () => refreshAfterTurn(qc, accountId),
  });
  const { messages: live, status } = chat;

  const turns = useMemo<NexaTurn[]>(
    () => [...(history ?? []), ...live.map(fromLive)],
    [history, live],
  );

  const busy = status === "submitted" || status === "streaming";
  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      void chat.sendMessage({ text: t });
    },
    [chat, busy],
  );
  const retry = useCallback(() => {
    if (!busy) void chat.regenerate();
  }, [chat, busy]);

  return {
    turns,
    loading: history === null,
    busy,
    working: busy ? (workingOf(live.at(-1)) ?? "Pensando") : null,
    error: chat.error ? "Não consegui responder agora." : null,
    send,
    retry,
    stop: chat.stop,
  };
}
