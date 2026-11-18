import { useChannels } from "./api";

/** Página do Facebook conectada pela Zernio: é por ela que chegam os leads de anúncio. */
export function useZernioLeadsStatus(accountId: string) {
  const channels = useChannels(accountId);
  const page = (channels.data ?? []).find(
    (c) => c.provider === "zernio" && c.platform === "facebook" && c.status === "connected",
  );
  return {
    done: Boolean(page),
    loading: channels.isLoading,
    summary: page
      ? `Leads da página ${page.name ?? page.handle ?? ""} entrando pela Zernio`.trim()
      : "",
  };
}
