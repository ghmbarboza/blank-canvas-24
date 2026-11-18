-- E-mail 1:1 e e-mail marketing (Fase M2 + M3), portado do motor da EasyCover.
-- Domínios e entregabilidade, modelos, campanhas, cada mensagem enviada, eventos (abertura,
-- clique, entrega, bounce, reclamação, descadastro) e as caixas do vendedor (OAuth, pendente).

-- ───────────────────────── domínios de envio ─────────────────────────
create table if not exists public.email_domains (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain text not null check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  records jsonb not null default '{}'::jsonb,
  warmup_started_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, domain)
);
alter table public.email_domains enable row level security;
drop policy if exists email_domains_select on public.email_domains;
create policy email_domains_select on public.email_domains for select using (public.is_member(account_id));
drop policy if exists email_domains_write on public.email_domains;
create policy email_domains_write on public.email_domains for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── modelos ─────────────────────────
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  subject text not null default '' check (length(subject) <= 200),
  preheader text check (preheader is null or length(preheader) <= 200),
  blocks jsonb not null default '[]'::jsonb,
  html text not null default '',
  category text not null default 'marketing' check (category in ('marketing','transactional','one_to_one')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists email_templates_touch on public.email_templates;
create trigger email_templates_touch before update on public.email_templates for each row execute function public.touch_updated_at();
alter table public.email_templates enable row level security;
drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates for select using (public.is_member(account_id));
drop policy if exists email_templates_insert on public.email_templates;
create policy email_templates_insert on public.email_templates for insert with check (public.is_member(account_id) and created_by = auth.uid());
drop policy if exists email_templates_update on public.email_templates;
create policy email_templates_update on public.email_templates for update
  using (public.is_member(account_id) and (created_by = auth.uid() or public.is_manager(account_id))) with check (public.is_member(account_id));
drop policy if exists email_templates_delete on public.email_templates;
create policy email_templates_delete on public.email_templates for delete using (created_by = auth.uid() or public.is_manager(account_id));

-- ───────────────────────── campanhas ─────────────────────────
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  template_id uuid references public.email_templates(id) on delete set null,
  subject text not null default '' check (length(subject) <= 200),
  preheader text,
  blocks jsonb not null default '[]'::jsonb,
  html text not null default '',
  segment_id uuid references public.segments(id) on delete set null,
  segment_filter jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','paused','canceled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  tested_at timestamptz,
  test_sent_to text,
  audience_estimate int,
  batch_size int not null default 100 check (batch_size between 10 and 500),
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_campaigns_account on public.email_campaigns (account_id, created_at desc);
drop trigger if exists email_campaigns_touch on public.email_campaigns;
create trigger email_campaigns_touch before update on public.email_campaigns for each row execute function public.touch_updated_at();
alter table public.email_campaigns enable row level security;
drop policy if exists email_campaigns_select on public.email_campaigns;
create policy email_campaigns_select on public.email_campaigns for select using (public.is_member(account_id));
drop policy if exists email_campaigns_write on public.email_campaigns;
create policy email_campaigns_write on public.email_campaigns for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Envio de campanha só passa por "sending" depois de um teste (bug 8 da EasyCover: o teste foi para a base inteira).
create or replace function public.tg_campaign_requires_test() returns trigger language plpgsql as $$
begin
  if new.status in ('scheduled','sending') and old.status is distinct from new.status and new.tested_at is null then
    raise exception 'envie um teste antes de disparar a campanha' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists email_campaigns_requires_test on public.email_campaigns;
create trigger email_campaigns_requires_test before update of status on public.email_campaigns
  for each row execute function public.tg_campaign_requires_test();

-- ───────────────────────── cada e-mail enviado ─────────────────────────
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('campaign','automation','one_to_one','transactional','reply','test')),
  campaign_id uuid references public.email_campaigns(id) on delete cascade,
  automation_run_id uuid,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'transactional' check (category in ('transactional','marketing')),
  to_email text not null,
  subject text not null default '',
  preview text,
  links text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','clicked','bounced','complained','failed','skipped')),
  skip_reason text,
  error text,
  provider_id text,
  open_count int not null default 0,
  click_count int not null default 0,
  first_cta text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now()
);
-- Continuação de campanha nunca reenvia para quem já foi enfileirado (bug 4 da EasyCover).
create unique index if not exists email_messages_campaign_contact on public.email_messages (campaign_id, contact_id) where campaign_id is not null and contact_id is not null;
create index if not exists email_messages_account on public.email_messages (account_id, created_at desc);
create index if not exists email_messages_contact on public.email_messages (contact_id, created_at desc);
create index if not exists email_messages_provider on public.email_messages (provider_id) where provider_id is not null;
create index if not exists email_messages_campaign on public.email_messages (campaign_id, status);
alter table public.email_messages enable row level security;
drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages for select using (
  public.is_member(account_id)
  and (not public.has_role(account_id, array['seller']::public.app_role[])
       or user_id = auth.uid()
       or contact_id is null
       or exists (select 1 from public.contacts c where c.id = contact_id and (c.owner_user_id is null or c.owner_user_id = auth.uid())))
);

create table if not exists public.email_events (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  email_message_id uuid references public.email_messages(id) on delete cascade,
  type text not null check (type in ('sent','delivered','open','click','bounce','complaint','unsubscribe','failed')),
  url text,
  cta text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists email_events_message on public.email_events (email_message_id, created_at);
create index if not exists email_events_account on public.email_events (account_id, created_at desc);
alter table public.email_events enable row level security;
drop policy if exists email_events_select on public.email_events;
create policy email_events_select on public.email_events for select using (public.is_member(account_id));

-- Números por campanha, calculados na hora (nada de contador que desanda).
create or replace view public.email_campaign_stats with (security_invoker = true) as
select campaign_id,
       count(*) filter (where status <> 'skipped') as queued,
       count(*) filter (where status in ('sent','delivered','opened','clicked')) as sent,
       count(*) filter (where status in ('delivered','opened','clicked')) as delivered,
       count(*) filter (where opened_at is not null) as opened,
       count(*) filter (where clicked_at is not null) as clicked,
       count(*) filter (where status = 'bounced') as bounced,
       count(*) filter (where status = 'complained') as complained,
       count(*) filter (where status = 'failed') as failed,
       count(*) filter (where status = 'skipped') as skipped
from public.email_messages
where campaign_id is not null
group by campaign_id;

-- ───────────────────────── caixas do vendedor (Gmail/Outlook, OAuth pendente) ─────────────────────────
create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  email text not null,
  status text not null default 'pending' check (status in ('pending','connected','error','revoked')),
  scopes text[] not null default '{}',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (account_id, user_id, provider)
);
alter table public.mailboxes enable row level security;
drop policy if exists mailboxes_select on public.mailboxes;
create policy mailboxes_select on public.mailboxes for select using (user_id = auth.uid() or public.has_role(account_id, array['owner','admin']::public.app_role[]));
drop policy if exists mailboxes_delete on public.mailboxes;
create policy mailboxes_delete on public.mailboxes for delete using (user_id = auth.uid());

-- ───────────────────────── segredo dos links (descadastro assinado) ─────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'platform:email_link_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'platform:email_link_secret');
  end if;
end $$;

create or replace function public.email_link_secret() returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'platform:email_link_secret';
$$;
revoke all on function public.email_link_secret() from public, anon, authenticated;
grant execute on function public.email_link_secret() to service_role;

-- Quantos e-mails de marketing a pessoa já recebeu hoje (teto de 1 por dia) — só serviço.
create or replace function public.email_marketing_sent_today(_account uuid, _emails text[])
returns table (to_email text) language sql stable security definer set search_path = public as $$
  select distinct lower(m.to_email) from public.email_messages m
   where m.account_id = _account and m.category = 'marketing'
     and m.status not in ('skipped','failed')
     and m.created_at >= now() - interval '20 hours'
     and lower(m.to_email) = any (_emails);
$$;
revoke all on function public.email_marketing_sent_today(uuid, text[]) from public, anon, authenticated;
grant execute on function public.email_marketing_sent_today(uuid, text[]) to service_role;

-- ───────────────────────── linha do tempo ─────────────────────────
create or replace function public.timeline_part_email(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'email'::text, m.id, coalesce(m.sent_at, m.created_at),
         case m.kind when 'campaign' then 'Campanha: ' || m.subject
                     when 'automation' then 'Automação: ' || m.subject
                     else 'E-mail: ' || m.subject end,
         m.preview,
         jsonb_build_object('status', m.status, 'kind', m.kind, 'opened_at', m.opened_at,
                            'clicked_at', m.clicked_at, 'first_cta', m.first_cta, 'campaign_id', m.campaign_id)
    from public.email_messages m
   where m.contact_id = _contact and m.status <> 'skipped';
$$;
grant execute on function public.timeline_part_email(uuid) to authenticated;
