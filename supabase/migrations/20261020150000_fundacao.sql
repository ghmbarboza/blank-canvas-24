-- Nexus One · fundação: extensões, contas, papéis, convites e cofre de credenciais.
-- Regra: toda função SECURITY DEFINER tem search_path fixo e EXECUTE revogado de PUBLIC.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.app_role as enum ('owner', 'admin', 'manager', 'agent', 'seller');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- contas
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  timezone text not null default 'America/Sao_Paulo',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'agent',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  last_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role not null default 'agent' check (role <> 'owner'),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_account_idx on public.invites(account_id);

-- ---------------------------------------------------------------- utilidades
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists accounts_touch on public.accounts;
create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();

-- Pertence à conta (qualquer papel ativo).
create or replace function public.is_member(_account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.account_id = _account and m.user_id = auth.uid() and m.is_active
  );
$$;

-- Tem um dos papéis pedidos na conta.
create or replace function public.has_role(_account uuid, _roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.account_id = _account and m.user_id = auth.uid() and m.is_active
      and m.role = any(_roles)
  );
$$;

create or replace function public.is_manager(_account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_account, array['owner','admin','manager']::public.app_role[]);
$$;

revoke execute on function public.is_member(uuid) from public;
revoke execute on function public.has_role(uuid, public.app_role[]) from public;
revoke execute on function public.is_manager(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role[]) to authenticated, service_role;
grant execute on function public.is_manager(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- RLS
alter table public.accounts enable row level security;
alter table public.memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_member(id));
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts for update to authenticated
  using (public.has_role(id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(id, array['owner','admin']::public.app_role[]));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(account_id));
drop policy if exists memberships_manage on public.memberships;
create policy memberships_manage on public.memberships for update to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner','admin']::public.app_role[]) and role <> 'owner');
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]) and role <> 'owner');

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships a join public.memberships b on a.account_id = b.account_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );
drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]));
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (public.has_role(account_id, array['owner','admin']::public.app_role[]));
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]));

-- ---------------------------------------------------------------- integrações por conta
-- Configuração NÃO secreta (base_url, ids). Segredo vai para o Vault.
create table if not exists public.account_integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('evolution','zernio','meta','twilio','openai','anthropic','google')),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','connected','error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider)
);
alter table public.account_integrations enable row level security;
drop trigger if exists account_integrations_touch on public.account_integrations;
create trigger account_integrations_touch before update on public.account_integrations
  for each row execute function public.touch_updated_at();

drop policy if exists account_integrations_select on public.account_integrations;
create policy account_integrations_select on public.account_integrations for select to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]));
drop policy if exists account_integrations_write on public.account_integrations;
create policy account_integrations_write on public.account_integrations for all to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner','admin']::public.app_role[]));

-- Grava um segredo no Vault. Só admin da conta. Nome: <escopo>:<id>:<chave>.
create or replace function public.secret_set(_account uuid, _scope text, _scope_id uuid, _key text, _value text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare
  _name text;
  _existing uuid;
begin
  if auth.role() <> 'service_role' and not public.has_role(_account, array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _scope not in ('integration','channel') or _key !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'invalid secret name' using errcode = '22023';
  end if;
  if _scope = 'channel' and not exists (select 1 from public.channels c where c.id = _scope_id and c.account_id = _account) then
    raise exception 'channel not in account' using errcode = '42501';
  end if;
  if _scope = 'integration' and _scope_id <> _account then
    raise exception 'integration scope must be the account' using errcode = '22023';
  end if;
  _name := _scope || ':' || _scope_id::text || ':' || _key;
  select id into _existing from vault.secrets where name = _name;
  if coalesce(_value, '') = '' then
    if _existing is not null then delete from vault.secrets where id = _existing; end if;
    return;
  end if;
  if _existing is null then
    perform vault.create_secret(_value, _name);
  else
    perform vault.update_secret(_existing, _value, _name);
  end if;
end $$;

-- Lê um segredo. Só service_role (edge functions).
create or replace function public.secret_get(_scope text, _scope_id uuid, _key text)
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = _scope || ':' || _scope_id::text || ':' || _key
  limit 1;
$$;

-- Diz quais chaves existem (sem valor), para a UI mostrar "configurado".
create or replace function public.secret_keys(_account uuid, _scope text, _scope_id uuid)
returns setof text language plpgsql stable security definer set search_path = public, vault as $$
begin
  if not public.has_role(_account, array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select split_part(s.name, ':', 3) from vault.secrets s
    where s.name like _scope || ':' || _scope_id::text || ':%';
end $$;

revoke execute on function public.secret_get(text, uuid, text) from public, anon, authenticated;
grant execute on function public.secret_get(text, uuid, text) to service_role;
