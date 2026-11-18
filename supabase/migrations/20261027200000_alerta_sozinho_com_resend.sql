-- Alerta da plataforma por e-mail sem SQL (#31). Quando o dono testa o Resend em Integrações e o teste
-- passa, o servidor chama platform_adopt_alert com o e-mail dele, a chave e o remetente da conta.
-- Só grava o que ainda falta: quem já configurou outro destino no Vault não é sobrescrito.
create or replace function public.platform_adopt_alert(_email text, _key text, _from text default null)
returns boolean
language plpgsql security definer set search_path = public, vault as $$
begin
  if coalesce(_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(_key, '') = '' then
    return false;
  end if;
  if public._platform_has('platform:alert_email') and public._platform_has('platform:resend_api_key') then
    return false;
  end if;
  perform public._platform_put('platform:alert_email', lower(_email));
  perform public._platform_put('platform:resend_api_key', _key);
  if coalesce(_from, '') <> '' then
    perform public._platform_put('platform:alert_from', left(_from, 200));
  end if;
  return true;
end $$;
revoke all on function public.platform_adopt_alert(text, text, text) from public, anon, authenticated;
grant execute on function public.platform_adopt_alert(text, text, text) to service_role;

-- platform_status passa a dizer para onde vai o alerta (o assistente mostra na instalação).
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
              where jobname in ('nexus-tick','nexus-fast','support-sla-sweep','nexus-forecast-snapshot','nexus-weekly-reports','nexus-health')),
    'jobs_expected', 6,
    'last_tick', (select max(last_seen) from public.service_heartbeats where service = 'app-cron')
  );
end $$;
revoke all on function public.platform_status() from public, anon, authenticated;
grant execute on function public.platform_status() to service_role;
