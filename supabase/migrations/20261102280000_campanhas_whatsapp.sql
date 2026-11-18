-- Campanha de WhatsApp com template aprovado (#67). O envio por contato é o mesmo das automações
-- (sendWhatsApp: consentimento de marketing, supressão, horário silencioso, conversa e template);
-- aqui ficam a campanha, o público e a fila de destinatários com ritmo.
create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  channel_id uuid not null references public.channels(id) on delete restrict,
  template_name text not null check (length(template_name) between 1 and 512),
  template_language text not null check (length(template_language) between 2 and 15),
  template_params text[] not null default '{}' check (cardinality(template_params) <= 20),
  audience_tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','sending','done','canceled')),
  launched_at timestamptz,
  finished_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_campaigns_account on public.whatsapp_campaigns (account_id, created_at desc);

create table if not exists public.whatsapp_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','skipped','failed')),
  reason text,
  message_id uuid,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (campaign_id, contact_id)
);
create index if not exists whatsapp_campaign_targets_next
  on public.whatsapp_campaign_targets (campaign_id, next_attempt_at) where status = 'queued';

alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_targets enable row level security;
drop policy if exists wa_campaigns_read on public.whatsapp_campaigns;
create policy wa_campaigns_read on public.whatsapp_campaigns for select to authenticated
  using (public.is_member(account_id));
drop policy if exists wa_campaigns_write on public.whatsapp_campaigns;
create policy wa_campaigns_write on public.whatsapp_campaigns for insert to authenticated
  with check (public.is_manager(account_id) and status = 'draft'
              and exists (select 1 from public.channels c where c.id = channel_id
                          and c.account_id = whatsapp_campaigns.account_id and c.platform = 'whatsapp'));
drop policy if exists wa_campaigns_edit on public.whatsapp_campaigns;
create policy wa_campaigns_edit on public.whatsapp_campaigns for update to authenticated
  using (public.is_manager(account_id) and status = 'draft')
  with check (public.is_manager(account_id) and status = 'draft');
drop policy if exists wa_campaigns_delete on public.whatsapp_campaigns;
create policy wa_campaigns_delete on public.whatsapp_campaigns for delete to authenticated
  using (public.is_manager(account_id) and status = 'draft');
drop policy if exists wa_targets_read on public.whatsapp_campaign_targets;
create policy wa_targets_read on public.whatsapp_campaign_targets for select to authenticated
  using (public.is_member(account_id));
revoke all on public.whatsapp_campaigns, public.whatsapp_campaign_targets from anon;
grant select, insert, update, delete on public.whatsapp_campaigns to authenticated;
grant select on public.whatsapp_campaign_targets to authenticated;

-- Quem a campanha alcança: telefone, etiquetas (vazio = todos), sem supressão no WhatsApp e,
-- se a conta exige (padrão), consentimento de marketing registrado. Mesma regra do envio.
create or replace function public.whatsapp_campaign_audience(_account uuid, _tags text[])
returns table (contact_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id from public.contacts c
   where c.account_id = _account
     and public.is_member(_account)
     and coalesce(c.phone, '') <> ''
     and (cardinality(coalesce(_tags, '{}')) = 0 or c.tags && _tags)
     and not exists (select 1 from public.suppressions s where s.account_id = _account
                      and s.channel = 'whatsapp'
                      and public.normalize_address('whatsapp', s.address) = public.normalize_address('whatsapp', c.phone))
     and (coalesce((select (settings #>> '{privacy,whatsapp_marketing_requires_consent}')::boolean
                      from public.accounts where id = _account), true) = false
          or exists (select 1 from public.contact_consent_state st where st.contact_id = c.id
                      and st.channel = 'whatsapp' and st.status = 'granted'))
$$;

create or replace function public.whatsapp_campaign_preview(_account uuid, _tags text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'eligible', (select count(*) from public.whatsapp_campaign_audience(_account, _tags)),
    'with_phone', (select count(*) from public.contacts c where c.account_id = _account
                     and public.is_member(_account) and coalesce(c.phone, '') <> ''
                     and (cardinality(coalesce(_tags, '{}')) = 0 or c.tags && _tags)))
$$;

-- Dispara: só gestor, só rascunho; congela o público (até 5.000) e enfileira o job com ritmo.
create or replace function public.launch_whatsapp_campaign(_campaign uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare c public.whatsapp_campaigns; n int;
begin
  select * into c from public.whatsapp_campaigns where id = _campaign for update;
  if c.id is null or not public.is_manager(c.account_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'Campanha já disparada' using errcode = 'P0001'; end if;
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

create or replace function public.cancel_whatsapp_campaign(_campaign uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.whatsapp_campaigns;
begin
  select * into c from public.whatsapp_campaigns where id = _campaign for update;
  if c.id is null or not public.is_manager(c.account_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.status <> 'sending' then return; end if;
  update public.whatsapp_campaign_targets set status = 'skipped', reason = 'campanha cancelada'
   where campaign_id = c.id and status = 'queued';
  update public.whatsapp_campaigns set status = 'canceled', finished_at = now() where id = c.id;
end $$;

revoke all on function public.whatsapp_campaign_audience(uuid, text[]) from public, anon, authenticated;
grant execute on function public.whatsapp_campaign_audience(uuid, text[]) to service_role;
revoke all on function public.whatsapp_campaign_preview(uuid, text[]) from public, anon;
grant execute on function public.whatsapp_campaign_preview(uuid, text[]) to authenticated, service_role;
revoke all on function public.launch_whatsapp_campaign(uuid) from public, anon;
grant execute on function public.launch_whatsapp_campaign(uuid) to authenticated, service_role;
revoke all on function public.cancel_whatsapp_campaign(uuid) from public, anon;
grant execute on function public.cancel_whatsapp_campaign(uuid) to authenticated, service_role;

-- As RPCs novas entram na lista do garantir_privilegios() (senão ele revoga o EXECUTE).
do $$ declare d text; begin
  d := pg_get_functiondef('public.garantir_privilegios()'::regprocedure);
  if position('launch_whatsapp_campaign' in d) = 0 then
    d := replace(d, '''workforce_history(_account uuid, _weeks integer)''',
      '''whatsapp_campaign_preview(_account uuid, _tags text[])'',''launch_whatsapp_campaign(_campaign uuid)'',''cancel_whatsapp_campaign(_campaign uuid)'',''workforce_history(_account uuid, _weeks integer)''');
    execute d;
  end if;
end $$;
revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;
