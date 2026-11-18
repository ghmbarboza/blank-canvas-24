-- Um agente por canal: cada canal (WhatsApp, Instagram, Ligação, SMS…) pode ter a sua porta de
-- entrada. Antes era uma só por conta (ai_agents_entry_uq). Agora conflitam só duas portas de
-- "todos os canais" (lista vazia) ou duas que marcam o mesmo canal. A de "todos os canais"
-- convive com as dos canais: atende o canal que não tem porta própria.
drop index if exists public.ai_agents_entry_uq;

create or replace function public.ai_agents_entry_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _outro text;
begin
  if not new.is_entry then
    return new;
  end if;
  -- serializa por conta: duas gravações ao mesmo tempo não passam juntas
  perform pg_advisory_xact_lock(hashtext('ai_agents_entry:' || new.account_id::text));
  select a.name into _outro
    from public.ai_agents a
   where a.account_id = new.account_id
     and a.is_entry
     and a.id <> new.id
     and ((cardinality(a.channels) = 0 and cardinality(new.channels) = 0)
          or a.channels && new.channels)
   limit 1;
  if _outro is not null then
    raise exception 'O agente "%" já é a porta de entrada desse canal. Desmarque nele ou escolha outro canal.', _outro
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_agents_entry_guard on public.ai_agents;
create trigger ai_agents_entry_guard
  before insert or update of is_entry, channels on public.ai_agents
  for each row execute function public.ai_agents_entry_guard();
