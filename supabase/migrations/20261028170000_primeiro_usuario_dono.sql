-- Regra do onboarding (28/10): o primeiro usuário do banco vira DONO, garantido no
-- banco e não na tela. O remix nasce zerado: quem cria a primeira conta ganha a central (conta,
-- funil padrão, papel de dono e lugar na fila de atendimento). Os seguintes só entram por convite.
-- O original (desenvolvimento, várias contas de teste) liga platform_settings.multi_account.

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  -- true só no ambiente de desenvolvimento: deixa criar mais de uma conta sem convite
  multi_account boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_settings enable row level security;
-- sem policy: só o servidor e as funções abaixo leem

-- Cria a central de alguém: conta, dono, funil padrão e o dono na fila (atende no 1º dia).
-- Trava no CORPO (o remix não copia REVOKE): só roda chamada por bootstrap_account ou pelo
-- gatilho do cadastro, que marcam a transação antes. Chamada direta pela API volta 42501.
create or replace function public.create_account_for(_uid uuid, _name text, _full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _account uuid;
  _pipeline uuid;
begin
  if coalesce(current_setting('nexus.create_account_ok', true), '') <> '1' then
    raise exception 'create_account_for só pelo cadastro' using errcode = '42501';
  end if;
  insert into profiles (id, full_name) values (_uid, nullif(trim(_full_name), ''))
  on conflict (id) do update set full_name = coalesce(excluded.full_name, profiles.full_name);

  insert into accounts (name) values (trim(_name)) returning id into _account;
  insert into memberships (account_id, user_id, role, display_name)
  values (_account, _uid, 'owner', nullif(trim(_full_name), ''));

  insert into pipelines (account_id, name, is_default, position)
  values (_account, 'Vendas', true, 0) returning id into _pipeline;
  insert into pipeline_stages (account_id, pipeline_id, name, position, color, probability, kind) values
    (_account, _pipeline, 'Novo lead', 0, 'sky', 10, 'open'),
    (_account, _pipeline, 'Qualificado', 1, 'violet', 30, 'open'),
    (_account, _pipeline, 'Proposta', 2, 'amber', 60, 'open'),
    (_account, _pipeline, 'Negociação', 3, 'orange', 80, 'open'),
    (_account, _pipeline, 'Ganho', 4, 'emerald', 100, 'won'),
    (_account, _pipeline, 'Perdido', 5, 'rose', 0, 'lost');

  -- o dono de um negócio pequeno também atende: "Minha fila" funciona no primeiro dia
  insert into queue_agents (account_id, user_id) values (_account, _uid) on conflict do nothing;

  update profiles set last_account_id = _account where id = _uid;
  return _account;
end $$;
revoke all on function public.create_account_for(uuid, text, text) from public, anon, authenticated;

-- Tela /bem-vindo: só cria conta nova se o banco ainda não tem nenhuma (ou no original).
create or replace function public.bootstrap_account(_name text, _full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(trim(coalesce(_name, ''))) < 2 then raise exception 'name too short' using errcode = '22023'; end if;
  if exists (select 1 from memberships where user_id = _uid and is_active) then
    raise exception 'Você já faz parte de uma central.' using errcode = 'P0001';
  end if;
  if exists (select 1 from accounts)
     and not coalesce((select multi_account from platform_settings where id), false) then
    raise exception 'Esta central já tem dono. Peça um convite a quem administra.' using errcode = 'P0001';
  end if;
  perform set_config('nexus.create_account_ok', '1', true);
  return public.create_account_for(_uid, _name, _full_name);
end $$;

-- Primeiro cadastro do banco = dono, sem depender da tela. Nunca derruba o cadastro: se algo
-- falhar aqui, a pessoa ainda entra e cai na tela /bem-vindo, que tenta de novo.
create or replace function public.tg_first_user_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- dois primeiros cadastros ao mesmo tempo: só um cria a central
  perform pg_advisory_xact_lock(hashtext('nexus:first-user-owner'));
  if not exists (select 1 from accounts) then
    perform set_config('nexus.create_account_ok', '1', true);
    perform public.create_account_for(
      new.id,
      'Minha empresa',
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    );
  end if;
  return new;
exception when others then
  raise warning 'first_user_owner: %', sqlerrm;
  return new;
end $$;
revoke all on function public.tg_first_user_owner() from public, anon, authenticated;

-- depois do gatilho do perfil (ordem alfabética: nexus_create_auth_profile vem antes)
drop trigger if exists nexus_first_user_owner on auth.users;
create trigger nexus_first_user_owner
  after insert on auth.users
  for each row execute function public.tg_first_user_owner();

-- quem já é dono e não está na fila passa a estar (mesma regra das contas novas)
insert into public.queue_agents (account_id, user_id)
select m.account_id, m.user_id from public.memberships m
where m.role = 'owner' and m.is_active
on conflict do nothing;
