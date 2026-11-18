import { useEffect, useState } from "react";
import { safeAuthDestination } from "@/lib/authentication";

export function useAuthDestination(redirect?: string) {
  const [destination, setDestination] = useState(() => safeAuthDestination(redirect));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stored = window.sessionStorage.getItem("nexus-auth-destination");
    setDestination(safeAuthDestination(redirect ?? stored ?? undefined));
    setReady(true);
  }, [redirect]);
  return { destination, ready };
}
