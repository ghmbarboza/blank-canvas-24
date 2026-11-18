import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Inbox, Loader2, LogOut, Mail, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PublicShell } from "./PublicShell";

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  pending: "Em atendimento",
  waiting_customer: "Aguardando você",
  resolved: "Resolvido",
  closed: "Encerrado",
};

interface PortalTicket {
  id: string;
  number: number;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}
interface PortalEvent {
  id: string;
  kind: string;
  body: string | null;
  to: string | null;
  from_customer: boolean;
  created_at: string;
}

const KEY = (slug: string) => `nexus:portal:${slug}`;

function readSession(slug: string): string | null {
  try {
    return sessionStorage.getItem(KEY(slug));
  } catch {
    return null;
  }
}
function writeSession(slug: string, v: string | null) {
  try {
    if (v) sessionStorage.setItem(KEY(slug), v);
    else sessionStorage.removeItem(KEY(slug));
  } catch {
    /* sem sessionStorage: a sessão vale só enquanto a página estiver aberta */
  }
}

class PortalError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>, session?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/public/portal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session ? { authorization: `Bearer ${session}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PortalError("Sem conexão. Confira a internet e tente de novo.", "network");
  }
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new PortalError(j.error ?? "Algo deu errado", j.code ?? "error");
  return j;
}

// Portal do cliente: entra por link mágico, acompanha e abre chamados, e lê a central de ajuda.
export function PortalPage({
  slug,
  accessToken,
  onConsumeToken,
}: {
  slug: string;
  accessToken: string | null;
  onConsumeToken: () => void;
}) {
  const [session, setSession] = useState<string | null>(() => readSession(slug));
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const info = useQuery({
    queryKey: ["portal", slug, "info"],
    retry: false,
    queryFn: () => call<{ company: string }>({ action: "info", slug }),
  });
  const verify = useMutation({
    mutationFn: (token: string) =>
      call<{ session: string; name: string | null }>({ action: "verify", slug, token }),
    onSuccess: (r) => {
      writeSession(slug, r.session);
      setSession(r.session);
      onConsumeToken();
    },
    onError: (e) => {
      setVerifyError(e.message);
      onConsumeToken();
    },
  });
  const { mutate: verifyMutate } = verify;
  useEffect(() => {
    if (accessToken) verifyMutate(accessToken);
  }, [accessToken, verifyMutate]);

  const logout = () => {
    writeSession(slug, null);
    setSession(null);
  };

  if (info.isError)
    return (
      <PublicShell>
        <div className="rounded-[24px] border border-border bg-surface p-8 text-center">
          <p className="text-[15px] font-semibold">Portal não encontrado</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Confira o endereço com a empresa.
          </p>
        </div>
      </PublicShell>
    );

  return (
    <PublicShell company={info.data?.company} wide>
      {verify.isPending ? (
        <Card>
          <p className="flex items-center gap-2 text-[14px]">
            <Loader2 className="size-4 animate-spin" /> Entrando…
          </p>
        </Card>
      ) : session ? (
        <Tickets slug={slug} session={session} onExpired={logout} onLogout={logout} />
      ) : (
        <RequestLink slug={slug} error={verifyError} />
      )}
    </PublicShell>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[24px] border border-border bg-surface p-6 sm:p-8", className)}>
      {children}
    </div>
  );
}

function RequestLink({ slug, error }: { slug: string; error: string | null }) {
  const [identity, setIdentity] = useState("");
  const req = useMutation({
    mutationFn: () => call<{ message: string }>({ action: "request", slug, identity }),
  });
  return (
    <Card>
      <h1 className="font-display text-[22px] font-medium">Acompanhe seus chamados</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        Digite o e-mail ou o celular que você usa com a gente. Enviamos um link de acesso, sem
        senha.
      </p>
      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      {req.isSuccess ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-surface-2 p-4 text-[14px]">
          <Mail className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>{req.data.message}</p>
        </div>
      ) : (
        <form
          className="mt-5 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            req.mutate();
          }}
        >
          <Label htmlFor="portal-id">E-mail ou celular</Label>
          <Input
            id="portal-id"
            autoComplete="email"
            inputMode="email"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="voce@email.com ou (11) 99999-9999"
            className="h-11"
          />
          {req.isError && (
            <p className="text-[13px] text-danger" role="alert">
              {req.error.message}
            </p>
          )}
          <Button type="submit" size="lg" disabled={req.isPending || identity.trim().length < 5}>
            {req.isPending && <Loader2 className="animate-spin" />} Receber o link
          </Button>
        </form>
      )}
      <a
        href={`/ajuda/${slug}`}
        className="mt-5 inline-flex items-center gap-2 text-[13px] text-muted-foreground underline-offset-2 hover:underline"
      >
        <BookOpen className="size-4" aria-hidden /> Ou procure a resposta na central de ajuda
      </a>
    </Card>
  );
}

function Tickets({
  slug,
  session,
  onExpired,
  onLogout,
}: {
  slug: string;
  session: string;
  onExpired: () => void;
  onLogout: () => void;
}) {
  const [view, setView] = useState<
    { kind: "list" } | { kind: "new" } | { kind: "ticket"; id: string }
  >({
    kind: "list",
  });
  const list = useQuery({
    queryKey: ["portal", slug, "tickets", session],
    retry: false,
    queryFn: () => call<{ tickets: PortalTicket[] }>({ action: "tickets" }, session),
  });
  useEffect(() => {
    if (list.error instanceof PortalError && list.error.code === "session_expired") onExpired();
  }, [list.error, onExpired]);

  if (view.kind === "new")
    return (
      <NewTicket
        session={session}
        slug={slug}
        onBack={() => setView({ kind: "list" })}
        onCreated={(id) => setView({ kind: "ticket", id })}
      />
    );
  if (view.kind === "ticket")
    return (
      <TicketView
        session={session}
        slug={slug}
        id={view.id}
        onBack={() => setView({ kind: "list" })}
      />
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 font-display text-[22px] font-medium">Seus chamados</h1>
        <Button onClick={() => setView({ kind: "new" })}>
          <Plus /> Abrir chamado
        </Button>
      </div>
      <div className="mt-5">
        {list.isPending ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : list.isError ? (
          <p className="text-[13px] text-danger">{list.error.message}</p>
        ) : (list.data?.tickets ?? []).length === 0 ? (
          <div className="rounded-xl bg-surface-2 p-6 text-center">
            <Inbox className="mx-auto size-6 text-subtle" aria-hidden />
            <p className="mt-2 text-[14px] font-medium">Você não tem chamados</p>
            <p className="text-[13px] text-muted-foreground">
              Precisa de ajuda? Abra um chamado acima.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {(list.data?.tickets ?? []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setView({ kind: "ticket", id: t.id })}
                  className="row-wash flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="font-mono text-[12px] text-subtle">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{t.subject}</span>
                  <StatusPill status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <a
          href={`/ajuda/${slug}`}
          className="inline-flex items-center gap-2 text-muted-foreground hover:underline"
        >
          <BookOpen className="size-4" aria-hidden /> Central de ajuda
        </a>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
        >
          <LogOut className="size-4" aria-hidden /> Sair
        </button>
      </div>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const done = status === "resolved" || status === "closed";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-[3px] text-[11px] font-medium",
        status === "waiting_customer"
          ? "bg-primary text-primary-foreground"
          : done
            ? "bg-surface-2 text-muted-foreground"
            : "bg-primary-soft text-primary",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function NewTicket({
  session,
  slug,
  onBack,
  onCreated,
}: {
  session: string;
  slug: string;
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () =>
      call<{ id: string; number: number }>({ action: "create", subject, description }, session),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["portal", slug, "tickets"] });
      onCreated(r.id);
    },
  });
  return (
    <Card>
      <BackButton onBack={onBack} />
      <h1 className="mt-2 font-display text-[22px] font-medium">Abrir chamado</h1>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Label htmlFor="pt-subject">Assunto</Label>
        <Input
          id="pt-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex.: Meu pedido não chegou"
          className="h-11"
        />
        <Label htmlFor="pt-desc">O que aconteceu</Label>
        <Textarea
          id="pt-desc"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Conte com detalhes. Não escreva senha nem número de cartão."
        />
        {create.isError && (
          <p className="text-[13px] text-danger" role="alert">
            {create.error.message}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={create.isPending || subject.trim().length < 3 || description.trim().length < 5}
        >
          {create.isPending && <Loader2 className="animate-spin" />} Enviar
        </Button>
      </form>
    </Card>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden /> Voltar
    </button>
  );
}

function TicketView({
  session,
  slug,
  id,
  onBack,
}: {
  session: string;
  slug: string;
  id: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const q = useQuery({
    queryKey: ["portal", slug, "ticket", id],
    retry: false,
    refetchInterval: 30_000,
    queryFn: () =>
      call<{
        ticket: {
          number: number;
          subject: string;
          description: string | null;
          status: string;
          created_at: string;
        };
        events: PortalEvent[];
      }>({ action: "ticket", ticketId: id }, session),
  });
  const send = useMutation({
    mutationFn: () => call({ action: "comment", ticketId: id, body }, session),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["portal", slug] });
    },
  });
  const t = q.data?.ticket;
  return (
    <Card>
      <BackButton onBack={onBack} />
      {q.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </p>
      ) : q.isError || !t ? (
        <p className="mt-4 text-[13px] text-danger">
          {q.error?.message ?? "Chamado não encontrado"}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-subtle">#{t.number}</span>
            <StatusPill status={t.status} />
          </div>
          <h1 className="mt-1 font-display text-[20px] font-medium">{t.subject}</h1>
          {t.description && (
            <p className="mt-3 rounded-xl bg-surface-2 p-4 text-[14px] whitespace-pre-wrap">
              {t.description}
            </p>
          )}
          <ol className="mt-5 grid gap-3">
            {(q.data?.events ?? []).map((e) =>
              e.kind === "comment" ? (
                <li
                  key={e.id}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-3 text-[14px]",
                    e.from_customer
                      ? "justify-self-end bg-primary text-primary-foreground"
                      : "border border-border bg-surface",
                  )}
                >
                  <p className="mb-1 text-[11px] opacity-70">
                    {e.from_customer ? "Você" : "Equipe"} ·{" "}
                    <time title={formatDateTime(e.created_at)}>{formatRelative(e.created_at)}</time>
                  </p>
                  <p className="whitespace-pre-wrap">{e.body}</p>
                </li>
              ) : (
                <li key={e.id} className="text-center text-[12px] text-subtle">
                  {e.kind === "created"
                    ? "Chamado aberto"
                    : `Situação: ${STATUS_LABEL[e.to ?? ""] ?? e.to}`}{" "}
                  · {formatRelative(e.created_at)}
                </li>
              ),
            )}
          </ol>
          {t.status !== "closed" && (
            <form
              className="mt-5 grid gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                send.mutate();
              }}
            >
              <Label htmlFor="pt-reply" className="sr-only">
                Sua mensagem
              </Label>
              <Textarea
                id="pt-reply"
                rows={3}
                value={body}
                onChange={(ev) => setBody(ev.target.value)}
                placeholder="Escreva para a equipe"
              />
              {send.isError && <p className="text-[13px] text-danger">{send.error.message}</p>}
              <Button
                type="submit"
                className="justify-self-end"
                disabled={send.isPending || !body.trim()}
              >
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar
              </Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
