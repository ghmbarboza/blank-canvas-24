import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PublicFormView } from "@/features/forms/PublicFormView";
import type { PublicForm } from "@/features/forms/types";

// Formulário hospedado: link direto para usar em bio, QR code, WhatsApp e anúncios.
export const Route = createFileRoute("/f/$formId")({
  head: () => ({ meta: [{ title: "Formulário" }, { name: "robots", content: "noindex" }] }),
  component: HostedForm,
});

function HostedForm() {
  const { formId } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-form", formId],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/public/form?id=${encodeURIComponent(formId)}`);
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({ error: "" }))).error || "Formulário indisponível",
        );
      return (await res.json()) as PublicForm;
    },
  });
  return (
    <main className="atmosphere grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-surface p-6 sm:p-8">
        {q.isPending ? (
          <Loader2 className="mx-auto my-10 animate-spin text-subtle" />
        ) : q.isError || !q.data ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">
            Este formulário não está disponível.
          </p>
        ) : (
          <PublicFormView form={q.data} />
        )}
      </div>
    </main>
  );
}
