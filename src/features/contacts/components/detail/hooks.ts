import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import type { ContactRow } from "../../types";
import type { TimelineRow } from "./Timeline360";

const PAGE = 40;

// Estado de consentimento por canal + supressões (descadastro, bounce, não contatar).
export function useContactConsentState(
  accountId: string,
  contact: Pick<ContactRow, "id" | "email" | "phone">,
) {
  return useQuery({
    queryKey: ["consent", contact.id],
    queryFn: async () => {
      const [consents, supp] = await Promise.all([
        supabase
          .from("contact_consent_state")
          .select("channel, status, source, created_at")
          .eq("contact_id", contact.id),
        supabase
          .from("suppressions")
          .select("channel, address, reason")
          .eq("account_id", accountId)
          .in("address", [
            contact.email?.toLowerCase() ?? "-",
            (contact.phone ?? "").replace(/\D/g, "") || "-",
          ]),
      ]);
      return { consents: consents.data ?? [], suppressions: supp.data ?? [] };
    },
  });
}

// Linha do tempo 360 (RPC contact_timeline), paginada pela data do último item.
export function useTimeline360(contactId: string) {
  return useInfiniteQuery({
    queryKey: ["timeline360", contactId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("contact_timeline", {
        _contact: contactId,
        _limit: PAGE,
        ...(pageParam ? { _before: pageParam } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as TimelineRow[];
    },
    getNextPageParam: (last) => (last.length < PAGE ? null : (last[last.length - 1]?.at ?? null)),
  });
}
