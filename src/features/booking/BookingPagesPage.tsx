import { hasChannel } from "@/lib/edition";
import { useMemo, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/features/contacts/api";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import {
  useBookingPages,
  useBookingStats,
  useConnectedCalendars,
  useDeleteBookingPage,
  type BookingPage,
} from "./api";
import { BookingLinkCard } from "./BookingLinkCard";
import { BookingPageDialog } from "./BookingPageDialog";
import { BookingPreview } from "./BookingPreview";
import { memberIds } from "./members";

function publicUrl(slug: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/agendar/${slug}`;
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Link copiado"),
    () => toast.error("Não deu para copiar. Selecione o endereço e copie à mão."),
  );
}

// Links públicos de agendamento: o cliente escolhe o horário livre e a reunião já nasce com sala, convite e lembretes.
export function BookingPagesPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const pages = useBookingPages(accountId);
  const stats = useBookingStats(accountId);
  const calendars = useConnectedCalendars(accountId, isManager);
  const remove = useDeleteBookingPage(accountId);
  const team = useTeamMembers(accountId);
  const [editing, setEditing] = useState<BookingPage | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BookingPage | null>(null);
  const members = useMemo(() => new Map((team.data ?? []).map((m) => [m.userId, m])), [team.data]);

  const list = pages.data ?? [];
  const selected = list.find((p) => p.id === selectedId) ?? list[0];
  const active = list.filter((p) => p.is_active).length;
  const upcoming = [...(stats.data?.values() ?? [])].reduce((s, x) => s + x.upcoming, 0);

  const startNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const missingFor = (p: BookingPage): string[] => {
    if (!calendars.data) return [];
    const missing = memberIds(p).filter((id) => !calendars.data.has(id));
    const named = missing.flatMap((id) => {
      const name = members.get(id)?.name.split(" ")[0];
      return name ? [name] : [];
    });
    const unnamed = missing.length - named.length;
    return unnamed > 0
      ? [...named, `${unnamed} pessoa${unnamed === 1 ? "" : "s"} da equipe`]
      : named;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Agendamentos"
        description={
          list.length
            ? `${active} de ${list.length} link${list.length === 1 ? "" : "s"} recebendo · ${upcoming} ${upcoming === 1 ? "reunião marcada" : "reuniões marcadas"} pela frente`
            : "Links públicos onde o cliente marca a reunião sozinho"
        }
        actions={
          <Button onClick={startNew}>
            <Plus /> Novo link
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        {pages.isPending ? (
          <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
            <Skeleton className="hidden h-[420px] rounded-xl xl:block" />
          </div>
        ) : pages.isError ? (
          <EmptyState
            icon={CalendarClock}
            title="Não deu para carregar os links"
            description={errorMessage(pages.error)}
            action={<Button onClick={() => void pages.refetch()}>Tentar de novo</Button>}
          />
        ) : list.length === 0 || !selected ? (
          <EmptyState
            icon={CalendarClock}
            title="Crie seu primeiro link de agendamento"
            description={
              hasChannel("video")
                ? "Mande o link no WhatsApp, no e-mail ou no site. O cliente vê só os horários livres da sua agenda e recebe o convite com a sala da reunião."
                : "Mande o link no WhatsApp. O cliente vê só os horários livres da sua agenda e marca sozinho."
            }
            action={
              <Button onClick={startNew}>
                <Plus /> Novo link
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <ul className="space-y-3" aria-label="Links de agendamento">
              {list.map((p) => (
                <li key={p.id}>
                  <BookingLinkCard
                    page={p}
                    url={publicUrl(p.slug)}
                    stats={
                      stats.data ? (stats.data.get(p.id) ?? { week: 0, upcoming: 0 }) : undefined
                    }
                    members={members}
                    missingCalendar={missingFor(p)}
                    isSelected={p.id === selected.id}
                    onSelect={() => setSelectedId(p.id)}
                    onCopy={() => copy(publicUrl(p.slug))}
                    onEdit={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                    onDelete={() => setDeleting(p)}
                  />
                </li>
              ))}
            </ul>
            <div className="hidden xl:block">
              <div className="sticky top-6">
                <BookingPreview
                  page={selected}
                  accountName={current!.accountName}
                  timeZone={current!.timezone || "America/Sao_Paulo"}
                  url={publicUrl(selected.slug)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <BookingPageDialog accountId={accountId} open={open} onOpenChange={setOpen} page={editing} />
      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem tiver o link vai ver a página indisponível. As reuniões já marcadas continuam na
              agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success("Link excluído"),
                  onError: (e) => toast.error(errorMessage(e)),
                });
                setDeleting(null);
              }}
            >
              Excluir link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
