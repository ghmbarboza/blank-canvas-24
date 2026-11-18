import { hasChannel } from "@/lib/edition";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useIntegrationEnabled } from "@/features/integrations/api";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCreateMeeting } from "./api";

interface Props {
  eventId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  title?: string;
  start?: string | null;
  durationMin?: number;
  sendInvite?: boolean;
  variant?: "default" | "outline";
  size?: "sm" | "default";
  className?: string;
  label?: string;
}

// "Iniciar reunião": abre a sala Vínculo do evento (ou cria uma agora) e leva o vendedor para dentro.
function StartMeetingButtonImpl({
  eventId,
  contactId,
  dealId,
  title,
  start,
  durationMin = 30,
  sendInvite = false,
  variant = "default",
  size = "default",
  className,
  label,
}: Props) {
  const accountId = useAccountId();
  const navigate = useNavigate();
  const create = useCreateMeeting(accountId);
  const meetOn = useIntegrationEnabled(accountId, "livekit");
  const existing = useQuery({
    queryKey: ["meeting-of-event", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id, status")
        .eq("event_id", eventId!)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  async function go() {
    if (existing.data) {
      void navigate({ to: "/sala/$meetingId", params: { meetingId: existing.data.id } });
      return;
    }
    try {
      const r = await create.mutateAsync({
        ...(title ? { title } : {}),
        contactId: contactId ?? null,
        dealId: dealId ?? null,
        eventId: eventId ?? null,
        start: start ?? new Date().toISOString(),
        durationMin,
        sendInvite,
      });
      if (r.guestUrl) {
        try {
          await navigator.clipboard.writeText(r.guestUrl);
          toast.success("Sala criada. O link do convidado foi copiado.");
        } catch {
          toast.success("Sala criada");
        }
      }
      void navigate({ to: "/sala/$meetingId", params: { meetingId: r.meeting.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const done = existing.data?.status === "ended";
  // Sem LiveKit a sala não abre: some o botão (reunião já encerrada ainda pode ser vista).
  if (meetOn === false && !done) return null;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      onClick={() => void go()}
      disabled={create.isPending || existing.isLoading}
    >
      {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Video aria-hidden />}
      {label ?? (existing.data ? (done ? "Ver reunião" : "Entrar na sala") : "Iniciar reunião")}
    </Button>
  );
}

/** Só aparece quando a edição tem o canal (ver src/lib/edition.ts). */
export function StartMeetingButton(props: Parameters<typeof StartMeetingButtonImpl>[0]) {
  return hasChannel("video") ? <StartMeetingButtonImpl {...props} /> : null;
}
