-- Frente Zernio (plano v2, §3-ter): WhatsApp, ligação pelo WhatsApp e número real pela Zernio.
-- Aditivo e idempotente. Escrita só pelo servidor (service_role); membros leem a própria conta.

-- ---------------------------------------------------------------- números da Zernio
-- Número comprado, em portabilidade ou trazido pelo cadastro do WhatsApp. `voice` e `calling`
-- guardam a configuração que o cliente escolheu na tela (o que mandamos para a Zernio).
create table if not exists public.zernio_numbers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  zernio_number_id text not null,
  source text not null default 'purchase' check (source in ('purchase', 'port_in', 'embedded')),
  phone_number text,
  country text,
  number_type text,
  status text not null default 'pending',
  status_reason text,
  profile_id text,
  whatsapp_account_id text,
  channel_id uuid references public.channels(id) on delete set null,
  kyc_url text,
  verification_url text,
  monthly_cents integer,
  voice jsonb not null default '{}'::jsonb,
  calling jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, zernio_number_id)
);
create index if not exists zernio_numbers_account_idx on public.zernio_numbers(account_id, created_at desc);
create index if not exists zernio_numbers_phone_idx on public.zernio_numbers(account_id, phone_number);

drop trigger if exists zernio_numbers_touch on public.zernio_numbers;
create trigger zernio_numbers_touch before update on public.zernio_numbers
  for each row execute function public.touch_updated_at();

alter table public.zernio_numbers enable row level security;
drop policy if exists zernio_numbers_select on public.zernio_numbers;
create policy zernio_numbers_select on public.zernio_numbers for select to authenticated
  using (public.is_member(account_id));

-- ---------------------------------------------------------------- ligação Zernio → calls
-- Mapeia o id da ligação na Zernio para a linha de `calls` (histórico único). A chave composta
-- impede duas linhas para a mesma ligação quando call.received e call.ended chegam juntos.
create table if not exists public.zernio_calls (
  account_id uuid not null references public.accounts(id) on delete cascade,
  zernio_call_id text not null,
  call_id uuid not null references public.calls(id) on delete cascade,
  channel text not null default 'pstn' check (channel in ('pstn', 'whatsapp')),
  zernio_account_id text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (account_id, zernio_call_id)
);
create index if not exists zernio_calls_call_idx on public.zernio_calls(call_id);

alter table public.zernio_calls enable row level security;
drop policy if exists zernio_calls_select on public.zernio_calls;
create policy zernio_calls_select on public.zernio_calls for select to authenticated
  using (public.is_member(account_id));

-- ---------------------------------------------------------------- permissão de ligação
-- O WhatsApp exige que o cliente aceite ligações da empresa antes da primeira ligação de saída.
create table if not exists public.zernio_call_permissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'granted', 'rejected')),
  is_permanent boolean not null default false,
  expires_at timestamptz,
  requested_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (account_id, channel_id, phone)
);
create index if not exists zernio_call_permissions_contact_idx
  on public.zernio_call_permissions(account_id, contact_id);

alter table public.zernio_call_permissions enable row level security;
drop policy if exists zernio_call_permissions_select on public.zernio_call_permissions;
create policy zernio_call_permissions_select on public.zernio_call_permissions for select to authenticated
  using (public.is_member(account_id));

-- ---------------------------------------------------------------- porta única da ligação
-- Garante a linha de `calls` de uma ligação da Zernio sob trava por ligação. Devolve o id e se
-- foi criada agora. Só o servidor chama (webhook).
create or replace function public.zernio_ensure_call(
  _account uuid,
  _zernio_call_id text,
  _direction text,
  _started_at timestamptz,
  _channel text,
  _zernio_account_id text
) returns table (call_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if _zernio_call_id is null or length(_zernio_call_id) < 4 or length(_zernio_call_id) > 80 then
    raise exception 'invalid call id' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(_account::text || ':' || _zernio_call_id, 0));
  select zc.call_id into _id from zernio_calls zc
    where zc.account_id = _account and zc.zernio_call_id = _zernio_call_id;
  if _id is not null then
    return query select _id, false;
    return;
  end if;
  insert into calls (account_id, direction, status, started_at, metadata)
  values (
    _account,
    case when _direction = 'outbound' then 'outbound' else 'inbound' end,
    'ringing',
    coalesce(_started_at, now()),
    jsonb_build_object('provider', 'zernio', 'zernio_call_id', _zernio_call_id,
                       'channel', coalesce(_channel, 'pstn'))
  )
  returning id into _id;
  insert into zernio_calls (account_id, zernio_call_id, call_id, channel, zernio_account_id)
  values (_account, _zernio_call_id, _id,
          case when _channel = 'whatsapp' then 'whatsapp' else 'pstn' end, _zernio_account_id);
  return query select _id, true;
end $$;
revoke execute on function public.zernio_ensure_call(uuid, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.zernio_ensure_call(uuid, text, text, timestamptz, text, text) to service_role;

-- ---------------------------------------------------------------- saúde do número de saída
-- Por número de saída (qualquer provedor): ligações na última hora, no período, atendidas,
-- curtas (atendidas com menos de 10 s) e duração média das atendidas.
create or replace function public.outbound_number_health(_account uuid, _hours integer default 24)
returns table (
  number text,
  calls_last_hour integer,
  calls_total integer,
  answered integer,
  short_calls integer,
  avg_duration_seconds numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select c.from_number,
         count(*) filter (where c.started_at > now() - interval '1 hour')::integer,
         count(*)::integer,
         count(*) filter (where c.answered_at is not null or c.status = 'completed')::integer,
         count(*) filter (where (c.answered_at is not null or c.status = 'completed')
                          and coalesce(c.billseconds, c.duration_seconds, 0) < 10)::integer,
         round(avg(coalesce(c.billseconds, c.duration_seconds))
               filter (where c.answered_at is not null or c.status = 'completed'), 1)
  from calls c
  where c.account_id = _account
    and c.direction = 'outbound'
    and c.from_number is not null
    and c.started_at > now() - make_interval(hours => greatest(1, least(coalesce(_hours, 24), 720)))
  group by c.from_number
  order by 3 desc
  limit 200;
end $$;
revoke execute on function public.outbound_number_health(uuid, integer) from public, anon;
grant execute on function public.outbound_number_health(uuid, integer) to authenticated, service_role;
