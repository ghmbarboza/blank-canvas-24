import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { LandingView } from "@/features/forms/LandingView";
import type { LandingBlock, PublicForm } from "@/features/forms/types";

interface LandingData {
  id: string;
  account_id: string;
  title: string;
  description: string | null;
  blocks: LandingBlock[];
  theme: { accent?: string };
  form: PublicForm | null;
}

// Landing page publicada (montada em Formulários › Páginas).
export const Route = createFileRoute("/p/$slug")({
  head: () => ({ meta: [{ title: "Página" }] }),
  component: LandingPage,
});

function LandingPage() {
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-landing", slug],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/public/landing?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Página não encontrada");
      return (await res.json()) as LandingData;
    },
  });
  // Título da aba e visita para atribuição.
  useEffect(() => {
    if (!q.data) return;
    document.title = q.data.title;
    let vid: string | null = null;
    try {
      vid = localStorage.getItem("nx_vid") ?? crypto.randomUUID();
      localStorage.setItem("nx_vid", vid);
    } catch {
      vid = null;
    }
    if (!vid) return;
    const p = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "gclid",
        "fbclid",
      ].flatMap((k) => (p.get(k) ? [[k, p.get(k)!]] : [])),
    );
    void fetch("/api/public/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: q.data.account_id,
        visitorId: vid,
        url: window.location.href,
        referrer: document.referrer,
        utm,
      }),
    }).catch(() => undefined);
  }, [q.data]);

  if (q.isPending) return <Loader2 className="mx-auto mt-32 animate-spin text-subtle" />;
  if (q.isError || !q.data)
    return (
      <p className="mt-32 text-center text-[14px] text-muted-foreground">
        Esta página não está no ar.
      </p>
    );
  return (
    <LandingView
      title={q.data.title}
      blocks={q.data.blocks}
      form={q.data.form}
      accent={q.data.theme?.accent ?? "#0A1F3B"}
    />
  );
}
