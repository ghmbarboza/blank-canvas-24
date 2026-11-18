-- Captação e atribuição (M6): formulários, landing pages, visitas, webchat e primeiro/último toque.

alter table public.contacts add column if not exists first_touch jsonb;
alter table public.contacts add column if not exists last_touch jsonb;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  title text,
  description text,
  fields jsonb not null default '[]'::jsonb,
  consent jsonb not null default '{"enabled":true,"text":"Autorizo o contato por e-mail e WhatsApp sobre este assunto. Posso cancelar quando quiser.","channels":["email","whatsapp"],"required":false}'::jsonb,
  submit_label text not null default 'Enviar',
  success_message text not null default 'Recebemos seus dados. Em breve entramos em contato.',
  redirect_url text check (redirect_url is null or redirect_url ~ '^https?://'),
  destination jsonb not null default '{"owner_mode":"none","users":[],"create_deal":false,"tags":[]}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused')),
  submissions_count int not null default 0,
  rr_cursor int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists forms_touch on public.forms;
create trigger forms_touch before update on public.forms for each row execute function public.touch_updated_at();
alter table public.forms enable row level security;
drop policy if exists forms_select on public.forms;
create policy forms_select on public.forms for select using (public.is_member(account_id));
drop policy if exists forms_write on public.forms;
create policy forms_write on public.forms for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  form_id uuid references public.forms(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  source text not null default 'form' check (source in ('form','landing','meta_ads','google_ads','api','webchat')),
  payload jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  referrer text,
  page_url text,
  ip_hash text,
  user_agent text,
  confirm_token text unique,
  confirmed_at timestamptz,
  external_id text,
  created_at timestamptz not null default now()
);
create index if not exists form_submissions_form on public.form_submissions (form_id, created_at desc);
create index if not exists form_submissions_contact on public.form_submissions (contact_id);
create index if not exists form_submissions_ip on public.form_submissions (ip_hash, created_at desc);
create unique index if not exists form_submissions_external on public.form_submissions (account_id, source, external_id) where external_id is not null;
alter table public.form_submissions enable row level security;
drop policy if exists form_submissions_select on public.form_submissions;
create policy form_submissions_select on public.form_submissions for select using (
  public.is_member(account_id) and (contact_id is null or exists (select 1 from public.contacts c where c.id = contact_id))
);
drop policy if exists form_submissions_delete on public.form_submissions;
create policy form_submissions_delete on public.form_submissions for delete using (public.is_manager(account_id));

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,60})[a-z0-9]$'),
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  blocks jsonb not null default '[]'::jsonb,
  form_id uuid references public.forms(id) on delete set null,
  theme jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  views int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists landing_pages_touch on public.landing_pages;
create trigger landing_pages_touch before update on public.landing_pages for each row execute function public.touch_updated_at();
alter table public.landing_pages enable row level security;
drop policy if exists landing_pages_select on public.landing_pages;
create policy landing_pages_select on public.landing_pages for select using (public.is_member(account_id));
drop policy if exists landing_pages_write on public.landing_pages;
create policy landing_pages_write on public.landing_pages for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.page_visits (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  visitor_id text not null check (length(visitor_id) between 8 and 64),
  contact_id uuid references public.contacts(id) on delete set null,
  url text not null,
  path text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists page_visits_account on public.page_visits (account_id, created_at desc);
create index if not exists page_visits_visitor on public.page_visits (account_id, visitor_id, created_at desc);
alter table public.page_visits enable row level security;
drop policy if exists page_visits_select on public.page_visits;
create policy page_visits_select on public.page_visits for select using (public.is_manager(account_id));

-- Sessão anônima do chat do site: o navegador guarda só o token; aqui fica o hash.
create table if not exists public.webchat_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token_hash text not null unique,
  visitor_id text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.webchat_sessions enable row level security;
-- Sem policy para usuários: só o servidor (service role) lê e escreve.

create or replace function public.timeline_part_forms(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'form'::text, s.id, s.created_at,
         case s.source when 'meta_ads' then 'Lead de anúncio (Meta)' when 'webchat' then 'Começou conversa no chat do site'
              else 'Formulário: ' || coalesce(f.name, 'removido') end,
         nullif(concat_ws(' · ', s.utm->>'source', s.utm->>'campaign'), ''),
         jsonb_build_object('form_id', s.form_id, 'source', s.source, 'utm', s.utm, 'page_url', s.page_url)
    from public.form_submissions s left join public.forms f on f.id = s.form_id
   where s.contact_id = _contact;
$$;
grant execute on function public.timeline_part_forms(uuid) to authenticated;

-- Atribuição: origem do primeiro e do último toque de cada contato e o que ele já comprou.
create or replace view public.contact_attribution with (security_invoker = true) as
select c.id as contact_id, c.account_id, c.created_at, c.lifecycle, c.source,
       coalesce(c.first_touch->>'source', c.source) as first_source,
       c.first_touch->>'medium' as first_medium,
       c.first_touch->>'campaign' as first_campaign,
       c.first_touch->>'channel' as first_channel,
       (c.first_touch->>'at')::timestamptz as first_at,
       coalesce(c.last_touch->>'source', c.source) as last_source,
       c.last_touch->>'medium' as last_medium,
       c.last_touch->>'campaign' as last_campaign,
       (c.last_touch->>'at')::timestamptz as last_at,
       coalesce((select sum(d.value) from public.deals d where d.contact_id = c.id and d.status = 'won'), 0)::numeric as won_value,
       (select count(*) from public.deals d where d.contact_id = c.id and d.status = 'won')::int as won_count
  from public.contacts c;
grant select on public.contact_attribution to authenticated;
