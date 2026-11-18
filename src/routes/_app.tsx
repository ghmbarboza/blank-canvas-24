import { useEffect } from "react";
import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";
import { useAccount } from "@/lib/account";
import { AppShell } from "@/components/layout/AppShell";
import { EditionOffPage, ModuleOffPage } from "@/components/layout/ModuleOffPage";
import { isRouteHidden } from "@/lib/edition";
import { enabledModules, moduleForPath } from "@/components/layout/modules";
import { FullScreenLoader } from "@/components/layout/FullScreenLoader";
import { useEnsurePlatform } from "@/features/setup/ensure";

// Layout autenticado: sem sessão vai para /entrar; sem conta vai para /bem-vindo.
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const { current, loading: loadingAccount, isAdmin } = useAccount();
  const navigate = useNavigate();
  // Só o caminho (string estável). <Navigate search={{...}}> recriava o objeto a cada render
  // e entrava em laço de redirecionamento que travava a aba.
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEnsurePlatform(current?.accountId ?? null, isAdmin);

  const waiting = loading || (Boolean(user) && loadingAccount);
  const target = waiting ? null : !user ? "entrar" : !current ? "bem-vindo" : null;

  useEffect(() => {
    // Na troca de rota o layout ainda vê "/entrar" por um instante: sem esta guarda o segundo
    // disparo trocava o redirect por "/entrar" e o link direto caía no Painel depois do login.
    if (path.startsWith("/entrar") || path.startsWith("/bem-vindo")) return;
    if (target === "entrar") navigate({ to: "/entrar", search: { redirect: path }, replace: true });
    else if (target === "bem-vindo") navigate({ to: "/bem-vindo", replace: true });
  }, [target, path, navigate]);

  if (waiting || target) return <FullScreenLoader />;

  // Recurso extra desligado: a rota mostra onde ligar, em vez da tela (o servidor também recusa).
  const extra = moduleForPath(path);
  const off = extra && !enabledModules(current?.settings).has(extra.id) ? extra : null;

  // Tela de um canal que esta edição não tem (ligações, reuniões, campanhas): não abre.
  if (isRouteHidden(path))
    return (
      <AppShell>
        <EditionOffPage />
      </AppShell>
    );

  return (
    <AppShell>{off ? <ModuleOffPage module={off} canEnable={isAdmin} /> : <Outlet />}</AppShell>
  );
}
