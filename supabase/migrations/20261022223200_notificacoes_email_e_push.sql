-- Frente C (notificações): preferências por tipo e canal (app, e-mail, push no navegador), inscrições
-- de Web Push e as chaves VAPID da plataforma. Toda notificação passa por public.notifications (venha de
-- notify_user, de gatilho SQL ou do job notify.user); o gatilho abaixo decide os canais extras e enfileira
-- notify.deliver. Sem preferência gravada: app ligado, e-mail desligado, push ligado (só chega se houver
-- navegador inscrito).
--
-- As chaves VAPID NÃO ficam neste arquivo: foram geradas fora (par P-256) e gravadas direto no Vault com
--   select vault.create_secret('<chave pública base64url>', 'platform:vapid_public');
--   select vault.create_secret('<chave privada d base64url>', 'platform:vapid_private');
-- Para trocar: vault.update_secret no mesmo nome (os navegadores inscritos precisam se inscrever de novo).

-- ───────────────────────── preferências ─────────────────────────
create table if not exists public.notification_prefs (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind ~ '^(\*|[a-z_]{2,40})$'),
  app boolean not null default true,
  email boolean not null default false,
  push boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id, kind)
);
drop trigger if exists notification_prefs_touch on public.notification_prefs;
create trigger notification_prefs_touch before update on public.notification_prefs for each row execute function public.touch_updated_at();
alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all
  using (user_id = auth.uid() and public.is_member(account_id))
  with check (user_id = auth.uid() and public.is_member(account_id));

-- ───────────────────────── inscrições de Web Push (por pessoa, vale em todas as contas) ─────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text,
  fail_count int not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- Inscreve (ou reassume) o navegador para quem está logado; o mesmo navegador troca de dono ao trocar de login.
create or replace function public.register_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, fail_count = 0
  returning id into _id;
  return _id;
end $$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ───────────────────────── chaves VAPID (só o servidor lê; a pública sai pela rota /api/push) ─────────────────────────
create or replace function public.platform_vapid() returns jsonb
language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'platform:vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'platform:vapid_private')
  );
$$;
revoke all on function public.platform_vapid() from public, anon, authenticated;
grant execute on function public.platform_vapid() to service_role;

-- ───────────────────────── canais de cada notificação ─────────────────────────
create or replace function public.notification_channels(_account uuid, _user uuid, _kind text)
returns table (app boolean, email boolean, push boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(p.app, true), coalesce(p.email, false), coalesce(p.push, true)
    from (select 1) one
    left join lateral (
      select np.app, np.email, np.push from public.notification_prefs np
       where np.account_id = _account and np.user_id = _user and np.kind in (_kind, '*')
       order by (np.kind = '*') limit 1
    ) p on true;
$$;
revoke all on function public.notification_channels(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.notification_channels(uuid, uuid, text) to service_role;

-- App desligado para o tipo: a notificação chega já lida (não acende o sino), mas segue para e-mail/push.
create or replace function public.tg_notifications_channels_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare _c record;
begin
  select * into _c from public.notification_channels(new.account_id, new.user_id, new.kind);
  if not _c.app and new.read_at is null then new.read_at := now(); end if;
  return new;
end $$;
drop trigger if exists notifications_channels_before on public.notifications;
create trigger notifications_channels_before before insert on public.notifications
  for each row execute function public.tg_notifications_channels_before();

create or replace function public.tg_notifications_channels_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare _c record; _push boolean;
begin
  select * into _c from public.notification_channels(new.account_id, new.user_id, new.kind);
  _push := _c.push and exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id);
  if _c.email or _push then
    insert into public.jobs (account_id, kind, payload, dedupe_key)
    values (new.account_id, 'notify.deliver',
            jsonb_build_object('notification_id', new.id, 'email', _c.email, 'push', _push),
            'notify.deliver:' || new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists notifications_channels_after on public.notifications;
create trigger notifications_channels_after after insert on public.notifications
  for each row execute function public.tg_notifications_channels_after();
