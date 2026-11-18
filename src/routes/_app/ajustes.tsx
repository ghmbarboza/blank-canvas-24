import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SettingsPage } from "@/features/settings/SettingsPage";
import { isSettingsTab, type SettingsTab } from "@/features/settings/tabs";
import { pageHead } from "@/lib/page-head";

interface SettingsSearch {
  aba?: SettingsTab | undefined;
}

export const Route = createFileRoute("/_app/ajustes")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const aba = search["aba"];
    return isSettingsTab(aba) ? { aba } : {};
  },
  head: () => pageHead("Ajustes", "Preferências e configurações da empresa no Nexus One."),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <SettingsPage
      tab={aba ?? "empresa"}
      onTabChange={(tab) =>
        void navigate({
          to: "/ajustes",
          search: tab === "empresa" ? {} : { aba: tab },
          replace: true,
        })
      }
    />
  );
}
