-- Conferência 1 da Central (04/11/2026):
-- R1: enqueue_job é função interna. Qualquer membro chamava rpc('enqueue_job') e mandava e-mail,
--     SMS e ligação com destino e conteúdo livres. Sai de authenticated (e da lista _auth do
--     garantir_privilegios, que repõe o acesso no remix); fica só a service role. O app enfileira
--     sempre pelo servidor (admin()).
-- R10: o remix nascia sem o job conversation-sla-sweep (o alerta de prazo da conversa existia na
--     tela e não disparava). Entra em _platform_jobs, que recria as rotinas em toda instalação.

revoke execute on function public.enqueue_job(uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.enqueue_job(uuid, text, jsonb, timestamptz, text) to service_role;

create or replace function public._platform_jobs()
returns integer language plpgsql security definer set search_path to 'public', 'cron' as $$
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
  if not exists (select 1 from cron.job where jobname = 'conversation-sla-sweep') then
    perform cron.schedule('conversation-sla-sweep', '* * * * *', 'select public.conversation_sla_sweep()'); _n := _n + 1;
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

-- garantir_privilegios(): enqueue_job sai da lista _auth (senão o remix repõe o acesso)
do $$ declare d text; begin
  d := pg_get_functiondef('public.garantir_privilegios()'::regprocedure);
  d := regexp_replace(d, '''enqueue_job\(_account uuid, _kind text, _payload jsonb, _run_at timestamp with time zone, _dedupe text\)'',\s*', '');
  execute d;
end $$;
revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;
select public.garantir_privilegios();
select public._platform_jobs();

-- platform_status: igual a 20261027200000_alerta_sozinho_com_resend.sql, contando o
-- conversation-sla-sweep (7 rotinas). Sem isso o assistente mostrava a instalação completa com 6.
create or replace function public.platform_status() returns jsonb
language plpgsql stable security definer set search_path = public, vault, cron as $$
declare _base text; _alert text;
begin
  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  if public._platform_has('platform:resend_api_key') then
    select decrypted_secret into _alert from vault.decrypted_secrets where name = 'platform:alert_email';
  end if;
  return jsonb_build_object(
    'app_base_url', _base,
    'cron_secret', public._platform_has('platform:cron_secret'),
    'agent_secret', public._platform_has('platform:agent_secret'),
    'email_link_secret', public._platform_has('platform:email_link_secret'),
    'meta_verify_token', public._platform_has('platform:meta_verify_token'),
    'vapid', public._platform_has('platform:vapid_public') and public._platform_has('platform:vapid_private'),
    'alert_email', nullif(_alert, ''),
    'jobs', (select coalesce(jsonb_agg(jobname order by jobname), '[]'::jsonb) from cron.job
              where jobname in ('nexus-tick','nexus-fast','support-sla-sweep','conversation-sla-sweep','nexus-forecast-snapshot','nexus-weekly-reports','nexus-health')),
    'jobs_expected', 7,
    'last_tick', (select max(last_seen) from public.service_heartbeats where service = 'app-cron')
  );
end $$;
revoke all on function public.platform_status() from public, anon, authenticated;
grant execute on function public.platform_status() to service_role;
