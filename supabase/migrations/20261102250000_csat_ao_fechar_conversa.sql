-- CSAT ao fechar conversa (#68). Antes a pesquisa só saía ao resolver chamado.
-- A empresa liga em Ajustes › Atendimento (settings.csat_on_close). Ao fechar a conversa, o
-- gatilho enfileira o job conversation.csat para 1 min depois (dá tempo de reabrir). O job
-- respeita no máximo uma pesquisa por contato a cada 7 dias.
alter table public.csat_responses
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
create index if not exists csat_responses_contact_sent on public.csat_responses (contact_id, sent_at desc);

create or replace function public.tg_conversation_csat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- pesquisa é cortesia: nunca derruba o fechamento da conversa
  begin
    if new.status = 'closed' and old.status is distinct from 'closed' and not new.is_group
       and new.contact_id is not null
       and coalesce((select (settings->>'csat_on_close')::boolean from public.accounts where id = new.account_id), false) then
      perform public.enqueue_job(new.account_id, 'conversation.csat',
        jsonb_build_object('conversation_id', new.id), now() + interval '1 minute',
        'csat-conv:' || new.id || ':' || to_char(now(), 'YYYYMMDD'));
    end if;
  exception when others then
    raise warning 'csat da conversa: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.tg_conversation_csat() from public, anon, authenticated;

drop trigger if exists conversations_csat on public.conversations;
create trigger conversations_csat after update of status on public.conversations
  for each row execute function public.tg_conversation_csat();
