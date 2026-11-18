-- Nexus One · bucket privado de mídia e ajuste do índice de canais.

-- Índice de canais comum (alvo de ON CONFLICT). Em banco novo a migration 0100 já cria assim.
drop index if exists public.channels_provider_external_uq;
create unique index if not exists channels_provider_external_uq on public.channels(provider, external_id);

-- Mídia em <account_id>/<conversation_id>/<arquivo>. Leitura por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.storage_account(_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when split_part(_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(_name, '/', 1)::uuid end;
$$;
revoke execute on function public.storage_account(text) from public, anon;
grant execute on function public.storage_account(text) to authenticated, service_role;

drop policy if exists media_select on storage.objects;
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_member(public.storage_account(name)));
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_member(public.storage_account(name)));
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_manager(public.storage_account(name)));
