import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LiveKitRoom,
  PreJoin,
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  type LocalUserChoices,
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  ArrowLeft,
  CalendarClock,
  CircleDot,
  Hourglass,
  Loader2,
  PhoneOff,
  ShieldCheck,
  Bot,
  UserCheck,
  UserX,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { meetingAction } from "../api";
import { Captions } from "./Captions";
import { ConferenceStage } from "./ConferenceStage";
import { CoachPanel } from "./CoachPanel";
import "./room.css";

interface JoinInfo {
  title: string;
  status: string;
  scheduled_start: string | null;
  account_name: string;
  time_zone: string;
  host_name: string | null;
  guest_name: string | null;
  recording_notice: string;
  require_admit: boolean;
  room_ready: boolean;
  manage_url: string | null;
}

interface Session {
  token: string;
  url: string;
  identity: string;
  room: string;
  role: "host" | "member" | "guest";
  waiting: boolean;
  title: string;
}

async function guestCall<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/public/meeting-join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok)
    throw Object.assign(new Error(j?.error ?? `Falha (${res.status})`), { code: j?.code });
  return j as T;
}

// Sala Vínculo: convidado entra pelo link (?t=) sem login; quem é da equipe entra logado como anfitrião.
export function RoomPage({ meetingId, token }: { meetingId: string; token: string | null }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const isGuest = Boolean(token);
  useEffect(() => {
    if (!isGuest && !loading && !user)
      void navigate({
        to: "/entrar",
        search: { redirect: `/sala/${meetingId}` } as never,
        replace: true,
      });
  }, [isGuest, loading, user, meetingId, navigate]);

  if (isGuest) return <GuestRoom meetingId={meetingId} token={token!} />;
  if (loading || !user)
    return (
      <Shell>
        <Loader2 className="mx-auto size-6 animate-spin text-white/60" />
      </Shell>
    );
  return <MemberRoom meetingId={meetingId} />;
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="nexus-room relative flex min-h-dvh flex-col overflow-hidden bg-[#071629] text-white"
      data-lk-theme="default"
    >
      <div
        className="hero-orb pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full bg-white/[0.06] blur-3xl"
        aria-hidden
      />
      <header className="relative z-10 flex items-center gap-3 px-6 py-4">
        <Logo className="w-8" />
        <span className="text-[13px] font-medium text-white/70">Sala Vínculo</span>
      </header>
      <main
        className={cn(
          "relative z-10 mx-auto flex w-full flex-1 flex-col justify-center px-4 pb-10",
          wide ? "max-w-6xl" : "max-w-xl",
        )}
      >
        {children}
      </main>
    </div>
  );
}

function when(iso: string | null, tz: string) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

function GuestRoom({ meetingId, token }: { meetingId: string; token: string }) {
  const info = useQuery({
    queryKey: ["meeting-join-info", meetingId],
    retry: false,
    queryFn: () => guestCall<JoinInfo>({ meetingId, t: token, action: "info" }),
  });
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [joining, setJoining] = useState(false);
  const [left, setLeft] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  if (left) return <LeftScreen />;
  if (info.isPending)
    return (
      <Shell>
        <Loader2 className="mx-auto size-6 animate-spin text-white/60" />
      </Shell>
    );
  if (info.isError)
    return (
      <Shell>
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center">
          <VideoOff className="mx-auto size-8 text-white/60" />
          <h1 className="mt-4 font-display text-[22px] font-medium">
            Não conseguimos abrir a sala
          </h1>
          <p className="mt-2 text-[14px] text-white/70">{errorMessage(info.error)}</p>
        </div>
      </Shell>
    );
  const i = info.data;
  if (!i.room_ready || unavailable) return <RoomUnavailable manageUrl={i.manage_url} />;

  if (session && choices)
    return (
      <InRoom
        session={session}
        choices={choices}
        meetingId={meetingId}
        onLeave={() => setLeft(true)}
        onUnavailable={() => setUnavailable(true)}
      />
    );

  async function join(c: LocalUserChoices) {
    if (!consent) {
      toast.error("Confirme que leu o aviso de gravação para entrar");
      return;
    }
    setJoining(true);
    try {
      const r = await guestCall<{
        token: string;
        url: string;
        identity: string;
        room: string;
        waiting: boolean;
        title: string;
      }>({
        meetingId,
        t: token,
        name: c.username,
        action: "join",
        consent: true,
      });
      setChoices(c);
      setSession({ ...r, role: "guest" });
    } catch (err) {
      if ((err as { code?: string }).code === "livekit_not_configured") setUnavailable(true);
      else toast.error(errorMessage(err));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Shell>
      <p className="text-[12px] font-medium tracking-[0.18em] text-white/60 uppercase">
        {i.account_name}
      </p>
      <h1 className="mt-2 font-display text-[28px] leading-tight font-medium">{i.title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/70">
        {i.scheduled_start && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4" /> {when(i.scheduled_start, i.time_zone)}
          </span>
        )}
        {i.host_name && <span>com {i.host_name}</span>}
      </p>
      <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-2">
        <PreJoin
          defaults={{ username: i.guest_name ?? "", videoEnabled: true, audioEnabled: true }}
          joinLabel={joining ? "Entrando…" : "Entrar na reunião"}
          micLabel="Microfone"
          camLabel="Câmera"
          userLabel="Seu nome"
          onSubmit={(c) => void join(c)}
          onValidate={(c) => c.username.trim().length >= 2}
          persistUserChoices
        />
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[13px] text-white/80">
        <Checkbox
          checked={consent}
          onCheckedChange={(c) => setConsent(c === true)}
          className="mt-0.5 border-white/40"
        />
        <span>
          <ShieldCheck className="mr-1 inline size-4 text-white/70" />
          {i.recording_notice} Ao entrar, você concorda com a gravação e a transcrição desta
          reunião.
        </span>
      </label>
    </Shell>
  );
}

function MemberRoom({ meetingId }: { meetingId: string }) {
  const { current } = useAccount();
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [left, setLeft] = useState(false);
  const accountId = current?.accountId ?? "";
  const session = useQuery({
    queryKey: ["meeting-token", meetingId, accountId],
    enabled: Boolean(accountId),
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await callApi<{
        token: string;
        url: string;
        identity: string;
        room: string;
        isHost: boolean;
        meeting: { title: string; status: string };
      }>("/api/meetings", { accountId, meetingId, action: "token" });
      return {
        token: r.token,
        url: r.url,
        identity: r.identity,
        room: r.room,
        role: r.isHost ? "host" : "member",
        waiting: false,
        title: r.meeting.title,
      } satisfies Session;
    },
  });

  if (left) return <LeftScreen meetingId={meetingId} member />;
  if (session.isPending)
    return (
      <Shell>
        <Loader2 className="mx-auto size-6 animate-spin text-white/60" />
      </Shell>
    );
  if (session.isError)
    return (
      <Shell>
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center">
          <VideoOff className="mx-auto size-8 text-white/60" />
          <h1 className="mt-4 font-display text-[22px] font-medium">A sala não abriu</h1>
          <p className="mt-2 text-[14px] text-white/70">{errorMessage(session.error)}</p>
          <Button
            asChild
            variant="outline"
            className="mt-6 border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            <Link to="/reunioes">Voltar para reuniões</Link>
          </Button>
        </div>
      </Shell>
    );
  if (!choices)
    return (
      <Shell>
        <Link
          to="/reunioes/$meetingId"
          params={{ meetingId }}
          className="mb-4 inline-flex items-center gap-1 text-[12px] text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Detalhes da reunião
        </Link>
        <h1 className="font-display text-[28px] leading-tight font-medium">{session.data.title}</h1>
        <p className="mt-1 text-[13px] text-white/70">
          Confira câmera e microfone. O coach liga sozinho quando a conversa começar.
        </p>
        <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-2">
          <PreJoin
            joinLabel="Abrir a sala"
            micLabel="Microfone"
            camLabel="Câmera"
            userLabel="Seu nome"
            onSubmit={setChoices}
            persistUserChoices
          />
        </div>
      </Shell>
    );
  return (
    <InRoom
      session={session.data}
      choices={choices}
      meetingId={meetingId}
      accountId={accountId}
      onLeave={() => setLeft(true)}
    />
  );
}

function InRoom({
  session,
  choices,
  meetingId,
  accountId,
  onLeave,
  onUnavailable,
}: {
  session: Session;
  choices: LocalUserChoices;
  meetingId: string;
  accountId?: string;
  onLeave: () => void;
  onUnavailable?: () => void;
}) {
  const isSeller = session.role !== "guest";
  const [panel, setPanel] = useState(true);
  const [connected, setConnected] = useState(false);
  return (
    <div className="nexus-room flex h-dvh flex-col bg-[#071629] text-white" data-lk-theme="default">
      <LiveKitRoom
        serverUrl={session.url}
        token={session.token}
        connect
        video={choices.videoEnabled ? { deviceId: choices.videoDeviceId } : false}
        audio={choices.audioEnabled ? { deviceId: choices.audioDeviceId } : false}
        onConnected={() => setConnected(true)}
        onDisconnected={() => {
          if (connected || !onUnavailable) onLeave();
        }}
        onError={(e) => {
          // falhou antes de conectar: para o convidado vira "sala indisponível" com remarcar
          if (!connected && onUnavailable) onUnavailable();
          else toast.error("A conexão com a sala caiu. Recarregue a página para voltar.");
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <Logo className="w-7" />
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{session.title}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B85C5C]/20 px-2.5 py-1 text-[11px] font-medium text-white/90">
            <CircleDot className="size-3 text-[#B85C5C]" /> Gravando e transcrevendo
          </span>
          {isSeller && (
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={() => setPanel((p) => !p)}
            >
              <Bot /> {panel ? "Esconder coach" : "Mostrar coach"}
            </Button>
          )}
          {isSeller && accountId && <EndButton accountId={accountId} meetingId={meetingId} />}
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            {session.waiting ? <WaitingGate /> : <ConferenceStage />}
            <Captions />
          </div>
          {isSeller && panel && (
            <aside className="hidden w-[380px] shrink-0 flex-col gap-3 border-l border-white/[0.06] bg-[#061226]/60 p-4 backdrop-blur-xl lg:flex">
              {accountId && <WaitingList accountId={accountId} meetingId={meetingId} />}
              <CoachPanel meetingId={meetingId} checklist={null} />
            </aside>
          )}
        </div>
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

function WaitingGate() {
  const { localParticipant } = useLocalParticipant();
  const [admitted, setAdmitted] = useState(Boolean(localParticipant.permissions?.canPublish));
  useEffect(() => {
    const onChange = () => setAdmitted(Boolean(localParticipant.permissions?.canPublish));
    localParticipant.on("participantPermissionsChanged", onChange);
    return () => {
      localParticipant.off("participantPermissionsChanged", onChange);
    };
  }, [localParticipant]);
  if (admitted) return <ConferenceStage />;
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <Hourglass className="mx-auto size-8 animate-pulse text-white/70" />
        <p className="mt-4 font-display text-[22px] font-semibold">Aguardando liberação</p>
        <p className="mt-1 text-[14px] text-white/70">
          Quem conduz a reunião já foi avisado e vai te liberar em instantes.
        </p>
      </div>
    </div>
  );
}

function WaitingList({ accountId, meetingId }: { accountId: string; meetingId: string }) {
  const remote = useRemoteParticipants();
  const waiting = useMemo(
    () =>
      remote.filter(
        (p) => p.permissions && !p.permissions.canPublish && p.attributes?.["role"] === "guest",
      ),
    [remote],
  );
  if (waiting.length === 0) return null;
  const act = (identity: string, allow: boolean) =>
    meetingAction(accountId, meetingId, "admit", { identity, allow }).catch((e: unknown) =>
      toast.error(errorMessage(e)),
    );
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-3">
      <p className="text-[11px] font-medium tracking-[0.16em] text-white/60 uppercase">
        Na sala de espera
      </p>
      <ul className="mt-2 space-y-2">
        {waiting.map((p) => (
          <li key={p.identity} className="flex items-center gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{p.name || "Convidado"}</span>
            <button
              type="button"
              aria-label="Admitir"
              onClick={() => void act(p.identity, true)}
              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#001F35]"
            >
              <UserCheck className="mr-1 inline size-3" /> Admitir
            </button>
            <button
              type="button"
              aria-label="Recusar"
              onClick={() => void act(p.identity, false)}
              className="rounded-full p-1.5 text-white/60 hover:bg-white/10"
            >
              <UserX className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EndButton({ accountId, meetingId }: { accountId: string; meetingId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      className="bg-[#B85C5C] text-white hover:bg-[#a54f4f]"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await meetingAction(accountId, meetingId, "end");
          toast.success("Reunião encerrada. A ata fica pronta em instantes.");
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <PhoneOff /> Encerrar para todos
    </Button>
  );
}

function RoomUnavailable({ manageUrl }: { manageUrl: string | null }) {
  return (
    <Shell>
      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center">
        <VideoOff className="mx-auto size-8 text-white/60" />
        <h1 className="mt-4 font-display text-[22px] font-medium">Sala indisponível agora</h1>
        <p className="mt-2 text-[14px] text-white/70">
          Não conseguimos abrir a sala de vídeo neste momento. Você pode tentar de novo em alguns
          minutos ou escolher outro horário.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {manageUrl && (
            <Button asChild className="bg-white text-[#001F35] hover:bg-white/90">
              <a href={`${manageUrl}?acao=remarcar`}>
                <CalendarClock /> Remarcar
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => window.location.reload()}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function LeftScreen({ meetingId, member = false }: { meetingId?: string; member?: boolean }) {
  return (
    <Shell>
      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="font-display text-[24px] font-semibold">Você saiu da reunião</p>
        <p className="mt-2 text-[14px] text-white/70">
          {member
            ? "A ata, a nota e as tarefas aparecem na reunião assim que a transcrição for processada."
            : "Obrigado pela conversa. Pode fechar esta aba."}
        </p>
        {member && meetingId && (
          <Button asChild className="mt-6 bg-white text-[#001F35] hover:bg-white/90">
            <Link to="/reunioes/$meetingId" params={{ meetingId }}>
              Ver reunião
            </Link>
          </Button>
        )}
      </div>
    </Shell>
  );
}
