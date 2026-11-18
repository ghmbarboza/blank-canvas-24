-- Etiquetas na conversa e visões salvas da Caixa de entrada (#64).
-- Etiqueta: texto curto em minúsculas, até 10 por conversa (quem vê a conversa edita, RLS de
-- conversations). Visão salva: filtros nomeados, de cada pessoa, só ela lê e escreve.
alter table public.conversations add column if not exists tags text[] not null default '{}';
create index if not exists conversations_tags_gin on public.conversations using gin (tags);
create or replace function public.valid_conversation_tags(_tags text[]) returns boolean
language sql immutable set search_path = public as $$
  select cardinality(_tags) <= 10
     and not exists (select 1 from unnest(_tags) t where length(t) not between 1 and 30 or t <> lower(t))
$$;
alter table public.conversations drop constraint if exists conversations_tags_check;
alter table public.conversations add constraint conversations_tags_check
  check (public.valid_conversation_tags(tags));

create table if not exists public.inbox_views (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 40),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, user_id, name)
);
alter table public.inbox_views enable row level security;
drop policy if exists inbox_views_own on public.inbox_views;
create policy inbox_views_own on public.inbox_views for all to authenticated
  using (user_id = auth.uid() and public.is_member(account_id))
  with check (user_id = auth.uid() and public.is_member(account_id));
revoke all on public.inbox_views from anon;
grant select, insert, update, delete on public.inbox_views to authenticated;
