import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const SIGNED_TTL_SECONDS = 60 * 60;

// Mídia vive no bucket privado `media`; a tela lê por URL assinada de 1 h.
export function useSignedMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["media-url", path],
    enabled: Boolean(path),
    staleTime: (SIGNED_TTL_SECONDS - 120) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("media")
        .createSignedUrl(path!, SIGNED_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// Sobe um arquivo do atendente para <account>/<conversation>/out-<uuid>.<ext> e devolve o caminho.
export async function uploadOutgoingMedia(
  accountId: string,
  conversationId: string,
  file: File,
): Promise<string> {
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().slice(0, 8)
    : "bin";
  const path = `${accountId}/${conversationId}/out-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
