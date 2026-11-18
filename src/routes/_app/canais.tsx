import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ChannelsPage } from "@/features/channels/ChannelsPage";
import { parseZernioReturn, ZERNIO_RETURN_KEYS } from "@/features/channels/zernio/return";
import { pageHead } from "@/lib/page-head";

type ChannelsSearch = Partial<Record<"conectado" | (typeof ZERNIO_RETURN_KEYS)[number], string>>;

export const Route = createFileRoute("/_app/canais")({
  validateSearch: (search: Record<string, unknown>): ChannelsSearch => {
    const out: ChannelsSearch = {};
    for (const k of ["conectado", ...ZERNIO_RETURN_KEYS] as const) {
      const v = search[k];
      if (v !== undefined && v !== null && v !== "") out[k] = String(v).slice(0, 200);
    }
    return out;
  },
  head: () => pageHead("Canais", "Conexões de atendimento da sua empresa no Nexus One."),
  component: ChannelsRoute,
});

function ChannelsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const clear = useCallback(
    () => void navigate({ to: "/canais", search: {}, replace: true }),
    [navigate],
  );
  return (
    <ChannelsPage
      returnedFromConnect={search.conectado === "1"}
      zernioReturn={parseZernioReturn(search)}
      onReturnHandled={clear}
    />
  );
}
