import { Navigate, createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";
import { FullScreenLoader } from "@/components/layout/FullScreenLoader";
import { BRAND } from "@/lib/brand";
import { pageHead } from "@/lib/page-head";
import { useAuthDestination } from "@/hooks/use-auth-destination";

export const Route = createFileRoute("/")({
  head: () => pageHead("Início", BRAND.description),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const { destination, ready } = useAuthDestination();
  if (loading || !ready) return <FullScreenLoader />;
  return <Navigate to={user ? destination : "/entrar"} replace />;
}
