-- SAC superior (P6): portal do cliente com link mágico, base que se escreve sozinha, macros com
-- intenção, incidente em massa com página de status, chamado pai/filho e ligado a negócio/pedido.
-- Aditivo e idempotente.

-- ───────────────────────── vínculos do chamado ─────────────────────────
alter table public.tickets add column if not exists parent_ticket_id uuid references public.tickets(id) on delete set null;
alter table public.tickets add column if not exists deal_id uuid references public.deals(id) on delete set null;
alter table public.tickets add column if not exists order_ref text check (order_ref is null or length(order_ref) <= 80);
alter table public.tickets add column if not exists kb_article_id uuid references public.kb_articles(id) on delete set null;
create index if not exists tickets_parent on public.tickets (parent_ticket_id) where parent_ticket_id is not null;
create index if not exists tickets_deal on public.tickets (deal_id) where deal_id is not null;

-- ───────────────────────── incidentes ─────────────────────────
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  status text not null default 'investigating' check (status in ('investigating','identified','monitoring','resolved')),
  impact text not null default 'major' check (impact in ('minor','major','critical')),
  is_public boolean not null default true,
  public_summary text check (public_summary is null or length(public_summary) <= 2000),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incidents_account on public.incidents (account_id, status, started_at desc);
drop trigger if exists incidents_touch on public.incidents;
create trigger incidents_touch before update on public.incidents for each row execute function public.touch_updated_at();
alter table public.incidents enable row level security;
drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents for select using (public.is_member(account_id));
drop policy if exists incidents_write on public.incidents;
create policy incidents_write on public.incidents for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.incident_updates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  status text not null check (status in ('investigating','identified','monitoring','resolved')),
  body text not null check (length(trim(body)) between 1 and 4000),
  is_public boolean not null default true,
  notified int not null default 0,
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists incident_updates_incident on public.incident_updates (incident_id, created_at desc);
alter table public.incident_updates enable row level security;
drop policy if exists incident_updates_select on public.incident_updates;
create policy incident_updates_select on public.incident_updates for select using (public.is_member(account_id));

alter table public.tickets add column if not exists incident_id uuid references public.incidents(id) on delete set null;
create index if not exists tickets_incident on public.tickets (incident_id) where incident_id is not null;

-- Vínculos sempre da mesma conta, sem ciclo de pai/filho (até 5 níveis).
create or replace function public.tg_ticket_links_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare _p uuid; _depth int := 0;
begin
  if new.parent_ticket_id is not null then
    if new.parent_ticket_id = new.id then raise exception 'o chamado não pode ser pai de si mesmo' using errcode = '22023'; end if;
    if not exists (select 1 from public.tickets t where t.id = new.parent_ticket_id and t.account_id = new.account_id) then
      raise exception 'chamado pai de outra conta' using errcode = '42501';
    end if;
    _p := new.parent_ticket_id;
    while _p is not null and _depth < 6 loop
      select parent_ticket_id into _p from public.tickets where id = _p;
      if _p = new.id then raise exception 'vínculo circular entre chamados' using errcode = '22023'; end if;
      _depth := _depth + 1;
    end loop;
  end if;
  if new.deal_id is not null and not exists (select 1 from public.deals d where d.id = new.deal_id and d.account_id = new.account_id) then
    raise exception 'negócio de outra conta' using errcode = '42501';
  end if;
  if new.incident_id is not null and not exists (select 1 from public.incidents i where i.id = new.incident_id and i.account_id = new.account_id) then
    raise exception 'incidente de outra conta' using errcode = '42501';
  end if;
  if new.kb_article_id is not null and not exists (select 1 from public.kb_articles a where a.id = new.kb_article_id and a.account_id = new.account_id) then
    raise exception 'artigo de outra conta' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tickets_links_check on public.tickets;
create trigger tickets_links_check before insert or update of parent_ticket_id, deal_id, incident_id, kb_article_id
  on public.tickets for each row execute function public.tg_ticket_links_check();

-- ───────────────────────── base que se escreve sozinha ─────────────────────────
alter table public.kb_articles add column if not exists source_ticket_id uuid references public.tickets(id) on delete set null;
alter table public.kb_articles add column if not exists ai_suggested boolean not null default false;
create unique index if not exists kb_articles_one_per_ticket on public.kb_articles (source_ticket_id) where source_ticket_id is not null;

-- ───────────────────────── macros ─────────────────────────
alter table public.quick_replies add column if not exists intents text[] not null default '{}';
alter table public.quick_replies add column if not exists use_count int not null default 0;

-- ───────────────────────── portal do cliente ─────────────────────────
-- Link mágico de uso único (só o hash fica no banco). Sem policy: só o servidor lê e grava.
create table if not exists public.portal_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token_hash text not null unique,
  channel text not null check (channel in ('email','whatsapp')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists portal_links_contact on public.portal_links (contact_id, created_at desc);
alter table public.portal_links enable row level security;

-- Segredo de assinatura da sessão do portal, criado no primeiro uso. Só o servidor.
create or replace function public.portal_secret() returns text
language plpgsql security definer set search_path = public, vault as $$
declare _s text;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select decrypted_secret into _s from vault.decrypted_secrets where name = 'platform:portal_secret';
  if coalesce(_s, '') = '' then
    _s := encode(extensions.gen_random_bytes(32), 'hex');
    perform public._platform_put('platform:portal_secret', _s);
  end if;
  return _s;
end $$;
revoke all on function public.portal_secret() from public, anon, authenticated;
grant execute on function public.portal_secret() to service_role;

-- O portal abre chamado pelo servidor.
grant execute on function public.create_ticket(uuid, text, text, uuid, uuid, text, text, text, uuid) to service_role;
