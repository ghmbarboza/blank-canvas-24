import { Navigate, createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";
import { FullScreenLoader } from "@/components/layout/FullScreenLoader";
import { pageHead } from "@/lib/page-head";
import { useAuthDestination } from "@/hooks/use-auth-destination";

export const Route = createFileRoute("/")({
  head: () => pageHead("Nexus One", "Central de atendimento e vendas do Nexus One."),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const { destination, ready } = useAuthDestination();
  if (loading || !ready) return <FullScreenLoader />;
  return <Navigate to={user ? destination : "/entrar"} replace />;
}
