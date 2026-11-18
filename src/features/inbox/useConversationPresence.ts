import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import { othersInConversation, type PresenceMeta, type Viewer } from "./presence";

const TYPING_IDLE_MS = 4_000;

/**
 * Presença na conversa pelo Realtime, em canal privado "conversa:<id>" (só entra quem pode ver a
 * conversa: política em realtime.messages). Manda só o user_id e se está digitando; o nome sai da
 * lista de membros no próprio navegador.
 */
export function useConversationPresence(
  conversationId: string,
  myId: string | null,
  nameOf: (userId: string) => string | undefined,
): { viewers: Viewer[]; notifyTyping: () => void } {
  const [state, setState] = useState<Record<string, PresenceMeta[]>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingRef = useRef(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!myId) return;
    const channel = supabase.channel(`conversa:${conversationId}`, {
      config: { private: true, presence: { key: myId } },
    });
    channelRef.current = channel;
    channel.on("presence", { event: "sync" }, () => {
      setState(channel.presenceState<PresenceMeta>() as Record<string, PresenceMeta[]>);
    });
    // canal privado: o Realtime precisa do token da sessão antes de assinar
    let active = true;
    void supabase.realtime.setAuth().then(() => {
      if (!active) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ user_id: myId, typing: false });
      });
    });
    return () => {
      active = false;
      if (idleRef.current) clearTimeout(idleRef.current);
      typingRef.current = false;
      channelRef.current = null;
      setState({});
      void supabase.removeChannel(channel);
    };
  }, [conversationId, myId]);

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !myId) return;
    if (!typingRef.current) {
      typingRef.current = true;
      void channel.track({ user_id: myId, typing: true });
    }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      typingRef.current = false;
      void channel.track({ user_id: myId, typing: false });
    }, TYPING_IDLE_MS);
  }, [myId]);

  return { viewers: othersInConversation(state, myId, nameOf), notifyTyping };
}
