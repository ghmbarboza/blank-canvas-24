-- Mensagem de cliente acorda o app na hora (18/11/2026).
--
-- A resposta da IA esperava a batida do agendador (pg_cron de 5 em 5 s) para o app ficar sabendo
-- que chegou mensagem: 0 a 5 s perdidos logo de saída, em todo canal. Agora o próprio banco chama a
-- via rápida do app no instante em que a mensagem do cliente é gravada. Vale para WhatsApp,
-- Instagram e chat do site (todos gravam em `messages`) e vai junto no remix, por ser migration.
--
-- O pedido sai pelo pg_net, que só envia depois do commit: o app já encontra o evento gravado.
-- Nunca derruba a gravação da mensagem: qualquer erro aqui é engolido e o agendador de 5 s cobre.
-- O gatilho chama-se messages_wake para rodar DEPOIS de messages_events (ordem alfabética), que é
-- quem cria o evento que a via rápida procura.
create or replace function public.tg_message_wake()
returns trigger language plpgsql security definer set search_path = public, net as $$
begin
  if new.direction = 'in' and not new.is_private then
    begin
      perform public.cron_fast_tick();
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;
revoke all on function public.tg_message_wake() from public, anon, authenticated;

drop trigger if exists messages_wake on public.messages;
create trigger messages_wake after insert on public.messages
  for each row execute function public.tg_message_wake();
