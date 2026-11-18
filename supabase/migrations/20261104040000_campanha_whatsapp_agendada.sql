-- Campanha de WhatsApp agendada: o gestor escolhe dia e hora; na hora, a fila monta o público
-- (quem pode receber NAQUELE momento, não no da criação) e dispara no ritmo de sempre.
alter table public.whatsapp_campaigns add column if not exists scheduled_at timestamptz;
alter table public.whatsapp_campaigns drop constraint if exists whatsapp_campaigns_status_check;
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_status_check
  check (status in ('draft','scheduled','sending','done','canceled'));

-- O disparo em si, sem checar quem chama: só o servidor (fila) e as duas portas abaixo usam.
create or replace function public._launch_whatsapp_campaign(_campaign uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare c public.whatsapp_campaigns; n int;
begin
  select * into c from public.whatsapp_campaigns where id = _campaign for update;
  if c.id is null then raise exception 'Campanha não encontrada' using errcode = 'P0001'; end if;
  if c.status not in ('draft','scheduled') then raise exception 'Campanha já disparada' using errcode = 'P0001'; end if;
  insert into public.whatsapp_campaign_targets (campaign_id, account_id, contact_id)
  select c.id, c.account_id, a.contact_id
    from public.whatsapp_campaign_audience(c.account_id, c.audience_tags) a
   limit 5000
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nenhum contato pode receber esta campanha' using errcode = 'P0001'; end if;
  update public.whatsapp_campaigns set status = 'sending', launched_at = now() where id = c.id;
  perform public.enqueue_job(c.account_id, 'whatsapp.campaign', jsonb_build_object('campaign_id', c.id),
                             now(), 'wa-camp:' || c.id || ':' || extract(epoch from now())::bigint);
  perform public.audit(c.account_id, 'campaign.sent', 'whatsapp_campaigns', c.id,
                       jsonb_build_object('targets', n, 'channel', 'whatsapp'));
  return n;
end $$;
revoke all on function public._launch_whatsapp_campaign(uuid) from public, anon, authenticated;
grant execute on function public._launch_whatsapp_campaign(uuid) to service_role;

create or replace function public.launch_whatsapp_campaign(_campaign uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare _acc uuid;
begin
  select account_id into _acc from public.whatsapp_campaigns where id = _campaign;
  if _acc is null or not public.is_manager(_acc) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return public._launch_whatsapp_campaign(_campaign);
end $$;

create or replace function public.schedule_whatsapp_campaign(_campaign uuid, _at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare c public.whatsapp_campaigns;
begin
  select * into c from public.whatsapp_campaigns where id = _campaign for update;
  if c.id is null or not public.is_manager(c.account_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.status not in ('draft','scheduled') then raise exception 'Campanha já disparada' using errcode = 'P0001'; end if;
  if _at is null or _at < now() + interval '5 minutes' then
    raise exception 'Escolha um horário daqui a pelo menos 5 minutos' using errcode = 'P0001';
  end if;
  if _at > now() + interval '60 days' then
    raise exception 'Agende para no máximo 60 dias' using errcode = 'P0001';
  end if;
  update public.whatsapp_campaigns set status = 'scheduled', scheduled_at = _at where id = c.id;
  -- a chave muda com o horário: reagendar não deixa o disparo antigo valendo (a fila confere a hora)
  perform public.enqueue_job(c.account_id, 'whatsapp.campaign_start', jsonb_build_object('campaign_id', c.id, 'at', _at),
                             _at, 'wa-camp-start:' || c.id || ':' || extract(epoch from _at)::bigint);
  perform public.audit(c.account_id, 'campaign.scheduled', 'whatsapp_campaigns', c.id,
                       jsonb_build_object('at', _at));
end $$;

create or replace function public.cancel_whatsapp_campaign(_campaign uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.whatsapp_campaigns;
begin
  select * into c from public.whatsapp_campaigns where id = _campaign for update;
  if c.id is null or not public.is_manager(c.account_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.status = 'scheduled' then
    -- agendada volta a rascunho: nada saiu ainda
    update public.whatsapp_campaigns set status = 'draft', scheduled_at = null where id = c.id;
    return;
  end if;
  if c.status <> 'sending' then return; end if;
  update public.whatsapp_campaign_targets set status = 'skipped', reason = 'campanha cancelada'
   where campaign_id = c.id and status = 'queued';
  update public.whatsapp_campaigns set status = 'canceled', finished_at = now() where id = c.id;
end $$;

revoke all on function public.schedule_whatsapp_campaign(uuid, timestamptz) from public, anon;
grant execute on function public.schedule_whatsapp_campaign(uuid, timestamptz) to authenticated, service_role;

do $$ declare d text; begin
  d := pg_get_functiondef('public.garantir_privilegios()'::regprocedure);
  if position('schedule_whatsapp_campaign' in d) = 0 then
    d := replace(d, '''launch_whatsapp_campaign(_campaign uuid)''',
      '''launch_whatsapp_campaign(_campaign uuid)'',''schedule_whatsapp_campaign(_campaign uuid, _at timestamp with time zone)''');
    execute d;
  end if;
end $$;
revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;
