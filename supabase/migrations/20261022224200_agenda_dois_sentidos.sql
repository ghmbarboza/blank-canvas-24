-- Agenda nos dois sentidos (Google Agenda e Microsoft Graph).
-- meetings.external_events: [{connection_id, provider, id, hash}] = o evento que gravamos em cada
-- agenda conectada do anfitrião; hash = estado (status|início|fim) que aquela agenda já tem.
-- calendar_connections.sync_cursor: syncToken do Google ou deltaLink do Graph; last_pull_at: última leitura.
alter table public.meetings
  add column if not exists external_events jsonb not null default '[]'::jsonb;
create index if not exists meetings_external_events on public.meetings using gin (external_events jsonb_path_ops);

alter table public.calendar_connections
  add column if not exists sync_cursor text,
  add column if not exists last_pull_at timestamptz;

-- Remarcar ou cancelar o evento da agenda do Nexus leva a reunião junto (a tela da agenda só mexe em events).
create or replace function public.events_sync_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.meetings m set
    scheduled_start = case when new.starts_at is distinct from old.starts_at then new.starts_at else m.scheduled_start end,
    scheduled_end = case when new.ends_at is distinct from old.ends_at then new.ends_at else m.scheduled_end end,
    status = case when new.status = 'canceled' and m.status = 'scheduled' then 'canceled' else m.status end
  where m.event_id = new.id
    and m.status = 'scheduled'
    and (
      (new.starts_at is distinct from old.starts_at and new.starts_at is distinct from m.scheduled_start)
      or (new.ends_at is distinct from old.ends_at and new.ends_at is distinct from m.scheduled_end)
      or (new.status = 'canceled' and old.status is distinct from 'canceled')
    );
  return null;
end $$;
drop trigger if exists events_sync_meeting on public.events;
create trigger events_sync_meeting after update of starts_at, ends_at, status on public.events
  for each row execute function public.events_sync_meeting();

-- Reunião remarcada ou cancelada no Nexus: enfileira calendar.push para atualizar/apagar o evento externo.
create or replace function public.meetings_enqueue_calendar_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.host_user_id is null then return null; end if;
  if (new.status = 'canceled' and old.status is distinct from 'canceled')
     or new.scheduled_start is distinct from old.scheduled_start
     or new.scheduled_end is distinct from old.scheduled_end
     or new.title is distinct from old.title then
    if jsonb_array_length(new.external_events) > 0
       or exists (select 1 from public.calendar_connections c
                  where c.account_id = new.account_id and c.user_id = new.host_user_id and c.status = 'connected') then
      insert into public.jobs (account_id, kind, payload, dedupe_key)
      values (new.account_id, 'calendar.push', jsonb_build_object('meeting_id', new.id), 'calendar:' || new.id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists meetings_enqueue_calendar_push on public.meetings;
create trigger meetings_enqueue_calendar_push after update of status, scheduled_start, scheduled_end, title on public.meetings
  for each row execute function public.meetings_enqueue_calendar_push();

revoke execute on function public.events_sync_meeting() from public, anon, authenticated;
revoke execute on function public.meetings_enqueue_calendar_push() from public, anon, authenticated;
