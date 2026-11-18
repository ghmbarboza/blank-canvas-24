-- Saúde da plataforma: cada serviço (tick do app, worker do livecoach) grava um sinal de vida;
-- uma verificação no pg_cron, que NÃO depende do app estar de pé, abre alerta quando um serviço
-- passa de 3 minutos sem sinal e fecha quando ele volta. Alerta é da plataforma, não de conta.
create table if not exists public.service_heartbeats (
  service text not null check (service ~ '^[a-z0-9][a-z0-9_.-]{1,59}$'),
  instance text not null default 'default' check (length(instance) between 1 and 120),
  last_seen timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  primary key (service, instance)
);
alter table public.service_heartbeats enable row level security;
-- sem policy: só a service role (rotas do servidor) e o pg_cron leem e escrevem
revoke all on public.service_heartbeats from anon, authenticated;

create table if not exists public.platform_alerts (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  kind text not null default 'service_down' check (kind in ('service_down')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz,
  resolved_notified_at timestamptz
);
create unique index if not exists platform_alerts_open
  on public.platform_alerts (service, kind) where resolved_at is null;
create index if not exists platform_alerts_recent on public.platform_alerts (opened_at desc);
alter table public.platform_alerts enable row level security;
revoke all on public.platform_alerts from anon, authenticated;

-- Grava o sinal de vida (chamado pelas rotas com a service role).
create or replace function public.record_heartbeat(_service text, _instance text, _meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.service_heartbeats (service, instance, last_seen, meta)
  values (_service, left(coalesce(nullif(_instance, ''), 'default'), 120), now(), coalesce(_meta, '{}'::jsonb))
  on conflict (service, instance) do update set last_seen = excluded.last_seen, meta = excluded.meta;
end $$;
revoke execute on function public.record_heartbeat(text, text, jsonb) from public, anon, authenticated;

-- E-mail do alerta direto pelo Resend via pg_net (funciona com o app fora do ar). Precisa de
-- platform:alert_email e platform:resend_api_key no Vault; platform:alert_from é opcional.
-- Sem eles o alerta fica só em platform_alerts e no /api/health.
create or replace function public.platform_alert_email(_subject text, _text text)
returns boolean language plpgsql security definer set search_path = public, vault, net as $$
declare _to text; _key text; _from text;
begin
  select decrypted_secret into _to from vault.decrypted_secrets where name = 'platform:alert_email';
  select decrypted_secret into _key from vault.decrypted_secrets where name = 'platform:resend_api_key';
  select decrypted_secret into _from from vault.decrypted_secrets where name = 'platform:alert_from';
  if coalesce(_to, '') = '' or coalesce(_key, '') = '' then return false; end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', coalesce(nullif(_from, ''), 'Nexus One <onboarding@resend.dev>'),
      'to', jsonb_build_array(_to),
      'subject', left(_subject, 200),
      'text', _text),
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || _key),
    timeout_milliseconds := 10000
  );
  return true;
end $$;
revoke execute on function public.platform_alert_email(text, text) from public, anon, authenticated;

-- Quem está fora: serviço cujo sinal mais recente (de qualquer instância) passou do limite.
-- Mesma regra de src/features/health/heartbeats.ts (DOWN_AFTER_MS = 3 min).
-- Para aposentar um serviço, apague as linhas dele em service_heartbeats.
create or replace function public.check_service_heartbeats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; _opened int := 0; _closed int := 0; _id uuid; _sent boolean;
begin
  for r in
    select service, max(last_seen) as last_seen from public.service_heartbeats group by service
  loop
    if r.last_seen < now() - interval '3 minutes' then
      insert into public.platform_alerts (service, message, details)
      values (r.service,
              format('%s sem sinal desde %s', r.service, to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')),
              jsonb_build_object('last_seen', r.last_seen))
      on conflict (service, kind) where resolved_at is null do nothing
      returning id into _id;
      if _id is not null then
        _opened := _opened + 1;
        _sent := public.platform_alert_email(
          format('[Nexus One] %s fora do ar', r.service),
          format(E'O serviço %s não manda sinal de vida desde %s (horário de Brasília).\nConfira /api/health e os logs do serviço.',
                 r.service, to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')));
        if _sent then update public.platform_alerts set notified_at = now() where id = _id; end if;
      end if;
    else
      update public.platform_alerts set resolved_at = now()
      where service = r.service and kind = 'service_down' and resolved_at is null
      returning id into _id;
      if _id is not null then
        _closed := _closed + 1;
        _sent := public.platform_alert_email(
          format('[Nexus One] %s voltou', r.service),
          format('O serviço %s voltou a mandar sinal de vida às %s (horário de Brasília).',
                 r.service, to_char(r.last_seen at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS')));
        if _sent then update public.platform_alerts set resolved_notified_at = now() where id = _id; end if;
      end if;
    end if;
    _id := null;
  end loop;
  return jsonb_build_object('opened', _opened, 'closed', _closed);
end $$;
revoke execute on function public.check_service_heartbeats() from public, anon, authenticated;

-- Job próprio no pg_cron, separado do nexus-tick: se o app cair, a verificação continua.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nexus-health') then
    perform cron.unschedule('nexus-health');
  end if;
  perform cron.schedule('nexus-health', '* * * * *', 'select public.check_service_heartbeats()');
end $$;
