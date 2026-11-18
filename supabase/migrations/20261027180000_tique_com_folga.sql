-- O runtime do app cancela a requisição quando o cliente desconecta. O pg_net desconectava em 25 s e
-- trabalhos longos (lote de avaliação da IA, transcrição) morriam no meio e voltavam na 2ª tentativa.
-- Agora os dois tiques esperam até 120 s.
create or replace function public.cron_tick() returns bigint
language plpgsql security definer set search_path = public, net as $$
declare _cfg jsonb := public.cron_config(); _id bigint;
begin
  if coalesce(_cfg->>'base_url', '') = '' or coalesce(_cfg->>'secret', '') = '' then
    return null;
  end if;
  select net.http_post(
    url := (_cfg->>'base_url') || '/api/public/cron',
    body := jsonb_build_object('at', now()),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', _cfg->>'secret'),
    timeout_milliseconds := 120000
  ) into _id;
  return _id;
end $$;
revoke all on function public.cron_tick() from public, anon, authenticated;

create or replace function public.cron_fast_tick() returns bigint
language plpgsql security definer set search_path = public, net as $$
declare _cfg jsonb := public.cron_config(); _id bigint;
begin
  if coalesce(_cfg->>'base_url', '') = '' or coalesce(_cfg->>'secret', '') = '' then return null; end if;
  if not exists (select 1 from public.domain_events where dispatched_at is null and (claimed_until is null or claimed_until < now()))
     and not exists (select 1 from public.jobs where status = 'queued' and run_at <= now()) then
    return null;
  end if;
  select net.http_post(
    url := (_cfg->>'base_url') || '/api/public/cron?fast=1',
    body := jsonb_build_object('at', now()),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', _cfg->>'secret'),
    timeout_milliseconds := 120000
  ) into _id;
  return _id;
end $$;
revoke all on function public.cron_fast_tick() from public, anon, authenticated;
