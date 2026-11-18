import { Link } from "@tanstack/react-router";
import { MessagesSquare, Plug } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannels } from "../api";

export function InboxEmpty({ accountId }: { accountId: string }) {
  const channels = useChannels(accountId);

  if (channels.isLoading) {
    return (
      <div className="grid flex-1 place-items-center" aria-busy="true">
        <Skeleton className="h-24 w-64 rounded-xl" />
      </div>
    );
  }

  if (!channels.data?.length) {
    return (
      <EmptyState
        className="flex-1"
        icon={Plug}
        title="Conecte seu primeiro canal"
        description="Ligue o WhatsApp, Instagram ou outra rede para as conversas dos clientes chegarem aqui."
        action={
          <Button asChild>
            <Link to="/canais">Conectar canal</Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      className="flex-1"
      icon={MessagesSquare}
      title="Selecione uma conversa"
      description="Escolha uma conversa na lista para ler, responder e ver o que a IA sugere."
    />
  );
}
