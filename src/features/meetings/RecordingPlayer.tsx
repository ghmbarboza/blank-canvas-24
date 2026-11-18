import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const SIGNED_TTL_SECONDS = 60 * 60;

// "storage://<bucket>/<caminho>" (gravação feita pelo worker, OGG ou MP4) vira URL assinada de 1 h;
// link http antigo (egress do LiveKit) toca direto.
export function RecordingPlayer({ url }: { url: string }) {
  const m = /^storage:\/\/([a-z0-9-]+)\/(.+)$/.exec(url);
  const signed = useQuery({
    queryKey: ["recording-url", url],
    enabled: Boolean(m),
    staleTime: (SIGNED_TTL_SECONDS - 120) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(m![1]!)
        .createSignedUrl(m![2]!, SIGNED_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const src = m ? signed.data : url;
  if (m && signed.isError)
    return <p className="text-[13px] text-muted-foreground">Não deu para abrir a gravação.</p>;
  if (!src) return <div className="h-10 animate-pulse rounded-full bg-surface-2" />;
  // vídeo composto (grade das câmeras) sai em MP4; o resto é áudio
  if (/\.mp4(\?|$)/.test(m ? m[2]! : url))
    return <video controls src={src} className="w-full rounded-2xl bg-black" preload="metadata" />;
  return <audio controls src={src} className="w-full" preload="none" />;
}
