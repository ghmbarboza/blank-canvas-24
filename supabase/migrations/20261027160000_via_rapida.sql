-- Via rápida da IA: o pg_cron chama /api/public/cron?fast=1 a cada 5 s (eventos + trabalhos vencidos),
-- para a resposta chegar em segundos e não no tique do minuto. Com dois despachantes rodando ao mesmo
-- tempo, o outbox passa a ser reservado de forma atômica (mesmo padrão do claim_jobs).

alter table public.domain_events add column if not exists claimed_until timestamptz;

create or replace function public.claim_domain_events(_limit int default 200, _lease_seconds int default 60)
returns setof public.domain_events
language sql security definer set search_path = public as $$
  update public.domain_events e
     set claimed_until = now() + make_interval(secs => _lease_seconds)
   where e.id in (
     select id from public.domain_events
      where dispatched_at is null and (claimed_until is null or claimed_until < now())
      order by id
      limit greatest(1, least(_limit, 500))
      for update skip locked)
  returning e.*;
$$;
revoke all on function public.claim_domain_events(int, int) from public, anon, authenticated;
grant execute on function public.claim_domain_events(int, int) to service_role;

create or replace function public.cron_fast_tick() returns bigint
language plpgsql security definer set search_path = public, net as $$
declare _cfg jsonb := public.cron_config(); _id bigint;
begin
  if coalesce(_cfg->>'base_url', '') = '' or coalesce(_cfg->>'secret', '') = '' then return null; end if;
  -- só chama se há o que fazer: evento novo ou trabalho vencido
  if not exists (select 1 from public.domain_events where dispatched_at is null and (claimed_until is null or claimed_until < now()))
     and not exists (select 1 from public.jobs where status = 'queued' and run_at <= now()) then
    return null;
  end if;
  select net.http_post(
    url := (_cfg->>'base_url') || '/api/public/cron?fast=1',
    body := jsonb_build_object('at', now()),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', _cfg->>'secret'),
    timeout_milliseconds := 25000
  ) into _id;
  return _id;
end $$;
revoke all on function public.cron_fast_tick() from public, anon, authenticated;

-- garantir_plataforma passa a criar 6 tarefas (a via rápida entra aqui também para remixes)
create or replace function public._platform_jobs() returns int
language plpgsql security definer set search_path = public, cron as $$
declare _n int := 0;
begin
  if not exists (select 1 from cron.job where jobname = 'nexus-tick') then
    perform cron.schedule('nexus-tick', '* * * * *', 'select public.cron_tick()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-fast') then
    perform cron.schedule('nexus-fast', '5 seconds', 'select public.cron_fast_tick()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'support-sla-sweep') then
    perform cron.schedule('support-sla-sweep', '*/5 * * * *', 'select public.support_sla_sweep()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-forecast-snapshot') then
    perform cron.schedule('nexus-forecast-snapshot', '0 9 * * 1', 'select public.take_forecast_snapshots()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-weekly-reports') then
    perform cron.schedule('nexus-weekly-reports', '0 11 * * 1', 'select public.enqueue_scheduled_reports()'); _n := _n + 1;
  end if;
  if not exists (select 1 from cron.job where jobname = 'nexus-health') then
    perform cron.schedule('nexus-health', '* * * * *', 'select public.check_service_heartbeats()'); _n := _n + 1;
  end if;
  return _n;
end $$;
revoke all on function public._platform_jobs() from public, anon, authenticated;

create or replace function public.platform_status() returns jsonb
language plpgsql stable security definer set search_path = public, vault, cron as $$
declare _base text;
begin
  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  return jsonb_build_object(
    'app_base_url', _base,
    'cron_secret', public._platform_has('platform:cron_secret'),
    'agent_secret', public._platform_has('platform:agent_secret'),
    'email_link_secret', public._platform_has('platform:email_link_secret'),
    'meta_verify_token', public._platform_has('platform:meta_verify_token'),
    'vapid', public._platform_has('platform:vapid_public') and public._platform_has('platform:vapid_private'),
    'jobs', (select coalesce(jsonb_agg(jobname order by jobname), '[]'::jsonb) from cron.job
              where jobname in ('nexus-tick','nexus-fast','support-sla-sweep','nexus-forecast-snapshot','nexus-weekly-reports','nexus-health')),
    'jobs_expected', 6,
    'last_tick', (select max(last_seen) from public.service_heartbeats where service = 'app-cron')
  );
end $$;
revoke all on function public.platform_status() from public, anon, authenticated;
grant execute on function public.platform_status() to service_role;
