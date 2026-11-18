-- Tempo real no remix (18/11/2026).
--
-- A cópia feita por remix nascia com a publicação `supabase_realtime` VAZIA: os
-- `alter publication ... add table` das migrations antigas rodam antes de a publicação existir no
-- projeto novo e são engolidos pelo `exception when others`. Sem as tabelas na publicação, a Caixa
-- de entrada não atualiza sozinha: a mensagem chega ao banco e a tela só mostra depois de recarregar.
--
-- garantir_realtime() repõe a lista. É idempotente e roda no primeiro pedido ao servidor de cada
-- cópia (src/backend/platform/privilegios.server.ts), além de rodar aqui.
create or replace function public.garantir_realtime()
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  t text;
  _n integer := 0;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'agent_approvals', 'agent_presence', 'calls', 'coach_tips', 'conversations', 'deal_items',
    'deals', 'kb_documents', 'meeting_participants', 'meeting_transcripts', 'messages',
    'notifications', 'setup_facts', 'ticket_events', 'tickets', 'work_items'
  ] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      _n := _n + 1;
    end if;
  end loop;
  return _n;
end $$;
revoke all on function public.garantir_realtime() from public, anon, authenticated;

select public.garantir_realtime();
