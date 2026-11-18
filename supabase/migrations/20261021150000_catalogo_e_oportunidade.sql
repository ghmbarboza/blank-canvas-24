-- Catálogo e oportunidade estimada pelo interesse.
-- Fluxo: atender → qualificar (score/temperatura da IA) → entender o interesse (produtos do catálogo que o
-- cliente quer) → estimar a oportunidade (itens do negócio, com upsell e cross-sell sugeridos).
-- O valor do negócio deixa de ser digitado no escuro: quando há itens, `deals.value` é a soma dos itens
-- aceitos e `deals.potential_value` soma também as sugestões ainda abertas. Recorrente mensal conta 12 meses.

-- ---------------------------------------------------------------- catálogo
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  kind text not null default 'product' check (kind in ('product','service')),
  category text check (category is null or length(category) <= 60),
  price numeric(14,2) not null default 0 check (price >= 0),
  billing text not null default 'one_time' check (billing in ('one_time','monthly','yearly')),
  keywords text[] not null default '{}',
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_account_idx on public.products(account_id, active, position);
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- upsell: versão superior do mesmo produto · cross_sell: complemento
create table if not exists public.product_relations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  related_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('upsell','cross_sell')),
  pitch text check (pitch is null or length(pitch) <= 240),
  created_at timestamptz not null default now(),
  unique (product_id, related_id, kind),
  check (product_id <> related_id)
);
create index if not exists product_relations_product_idx on public.product_relations(product_id);

-- ---------------------------------------------------------------- interesse
create table if not exists public.contact_interests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  confidence smallint not null default 50 check (confidence between 0 and 100),
  evidence text check (evidence is null or length(evidence) <= 400),
  source text not null default 'manual' check (source in ('ai','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, product_id)
);
create index if not exists contact_interests_contact_idx on public.contact_interests(contact_id);
drop trigger if exists contact_interests_touch on public.contact_interests;
create trigger contact_interests_touch before update on public.contact_interests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- itens do negócio
create table if not exists public.deal_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120), -- cópia: o item sobrevive ao produto
  kind text not null default 'core' check (kind in ('core','upsell','cross_sell')),
  status text not null default 'accepted' check (status in ('suggested','accepted','declined')),
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  billing text not null default 'one_time' check (billing in ('one_time','monthly','yearly')),
  line_total numeric(16,2) generated always as (
    round(quantity * unit_price * (1 - discount_pct / 100) * (case billing when 'monthly' then 12 else 1 end), 2)
  ) stored,
  source text not null default 'manual' check (source in ('ai','manual')),
  reason text check (reason is null or length(reason) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deal_items_deal_idx on public.deal_items(deal_id, position);
create unique index if not exists deal_items_product_uniq on public.deal_items(deal_id, product_id) where product_id is not null;
drop trigger if exists deal_items_touch on public.deal_items;
create trigger deal_items_touch before update on public.deal_items
  for each row execute function public.touch_updated_at();

alter table public.deals add column if not exists potential_value numeric(14,2) not null default 0 check (potential_value >= 0);
alter table public.deals add column if not exists value_source text not null default 'manual'
  check (value_source in ('manual','items'));

-- Valor do negócio acompanha os itens. Sem itens, o valor manual fica como está.
create or replace function public.recompute_deal_value(_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare _n int; _accepted numeric; _suggested numeric;
begin
  select count(*) filter (where status <> 'declined'),
         coalesce(sum(line_total) filter (where status = 'accepted'), 0),
         coalesce(sum(line_total) filter (where status = 'suggested'), 0)
    into _n, _accepted, _suggested
  from deal_items where deal_id = _deal;
  if _n = 0 then
    update deals set value_source = 'manual', potential_value = value where id = _deal and value_source = 'items';
    update deals set potential_value = value where id = _deal and value_source = 'manual';
  else
    update deals set value = _accepted, potential_value = _accepted + _suggested, value_source = 'items'
    where id = _deal;
  end if;
end $$;
revoke execute on function public.recompute_deal_value(uuid) from public, anon, authenticated;

create or replace function public.on_deal_items_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_deal_value(coalesce(new.deal_id, old.deal_id));
  if tg_op = 'UPDATE' and new.deal_id <> old.deal_id then
    perform public.recompute_deal_value(old.deal_id);
  end if;
  return null;
end $$;
drop trigger if exists deal_items_value on public.deal_items;
create trigger deal_items_value after insert or update or delete on public.deal_items
  for each row execute function public.on_deal_items_change();

-- Negócio com valor manual mantém o potencial igual ao valor.
create or replace function public.on_deal_manual_value() returns trigger
language plpgsql as $$
begin
  if new.value_source = 'manual' then new.potential_value := new.value; end if;
  return new;
end $$;
drop trigger if exists deals_manual_value on public.deals;
create trigger deals_manual_value before insert or update of value, value_source on public.deals
  for each row execute function public.on_deal_manual_value();
update public.deals set potential_value = value where value_source = 'manual';

-- ---------------------------------------------------------------- RLS
alter table public.products enable row level security;
alter table public.product_relations enable row level security;
alter table public.contact_interests enable row level security;
alter table public.deal_items enable row level security;

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using (public.is_member(account_id));
drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

drop policy if exists product_relations_select on public.product_relations;
create policy product_relations_select on public.product_relations for select to authenticated using (public.is_member(account_id));
drop policy if exists product_relations_write on public.product_relations;
create policy product_relations_write on public.product_relations for all to authenticated
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Interesse e itens seguem a visibilidade do contato e do negócio (o vendedor só vê os dele).
drop policy if exists contact_interests_all on public.contact_interests;
create policy contact_interests_all on public.contact_interests for all to authenticated
  using (public.is_member(account_id) and exists (select 1 from public.contacts c where c.id = contact_id))
  with check (public.is_member(account_id) and exists (select 1 from public.contacts c where c.id = contact_id and c.account_id = contact_interests.account_id));

drop policy if exists deal_items_all on public.deal_items;
create policy deal_items_all on public.deal_items for all to authenticated
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id))
  with check (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id and d.account_id = deal_items.account_id));

revoke all on public.products, public.product_relations, public.contact_interests, public.deal_items from anon;
grant select, insert, update, delete on public.products, public.product_relations, public.contact_interests, public.deal_items to authenticated;

-- ---------------------------------------------------------------- montar a oportunidade
-- A partir dos interesses do contato: pega (ou abre) o negócio aberto, põe cada produto de interesse
-- como item principal (aceito com confiança >= 70, senão sugerido) e sugere os upsells e cross-sells
-- do catálogo. Idempotente: rodar de novo só acrescenta o que falta. Roda com a permissão de quem chama.
create or replace function public.build_opportunity(_contact uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  _c record; _deal uuid; _pipeline uuid; _stage uuid; _pos int; _i record; _r record; _added int := 0;
begin
  select id, account_id, name, owner_user_id into _c from contacts where id = _contact;
  if _c.id is null then raise exception 'contato não encontrado' using errcode = 'P0002'; end if;
  if not exists (select 1 from contact_interests where contact_id = _contact) then
    raise exception 'sem interesse registrado' using errcode = 'P0001';
  end if;

  select id into _deal from deals where contact_id = _contact and status = 'open'
    order by created_at desc limit 1;
  if _deal is null then
    select id into _pipeline from pipelines where account_id = _c.account_id
      order by is_default desc, position, created_at limit 1;
    select id into _stage from pipeline_stages where pipeline_id = _pipeline and kind = 'open'
      order by position limit 1;
    if _stage is null then raise exception 'funil sem etapa aberta' using errcode = 'P0001'; end if;
    insert into deals (account_id, pipeline_id, stage_id, contact_id, title, owner_user_id, source)
    values (_c.account_id, _pipeline, _stage, _contact,
            left('Oportunidade · ' || coalesce(_c.name, 'novo lead'), 160),
            coalesce(_c.owner_user_id, auth.uid()), 'interesse')
    returning id into _deal;
  end if;

  select coalesce(max(position), 0) into _pos from deal_items where deal_id = _deal;

  for _i in
    select ci.confidence, ci.evidence, p.* from contact_interests ci
    join products p on p.id = ci.product_id
    where ci.contact_id = _contact and p.active order by ci.confidence desc
  loop
    if not exists (select 1 from deal_items where deal_id = _deal and product_id = _i.id) then
      _pos := _pos + 1; _added := _added + 1;
      insert into deal_items (account_id, deal_id, product_id, name, kind, status, unit_price, billing, source, reason, position)
      values (_c.account_id, _deal, _i.id, _i.name, 'core',
              case when _i.confidence >= 70 then 'accepted' else 'suggested' end,
              _i.price, _i.billing, 'ai', left(coalesce(_i.evidence, 'Interesse registrado'), 300), _pos);
    end if;
  end loop;

  for _r in
    select distinct on (rel.related_id) rel.kind, rel.pitch, p.*, src.name as from_name
    from deal_items di
    join product_relations rel on rel.product_id = di.product_id
    join products p on p.id = rel.related_id and p.active
    join products src on src.id = di.product_id
    where di.deal_id = _deal and di.kind = 'core' and di.status <> 'declined'
    order by rel.related_id, rel.kind
  loop
    if not exists (select 1 from deal_items where deal_id = _deal and product_id = _r.id) then
      _pos := _pos + 1; _added := _added + 1;
      insert into deal_items (account_id, deal_id, product_id, name, kind, status, unit_price, billing, source, reason, position)
      values (_c.account_id, _deal, _r.id, _r.name, _r.kind, 'suggested', _r.price, _r.billing, 'ai',
              left(coalesce(_r.pitch, case _r.kind when 'upsell' then 'Versão superior de ' else 'Complementa ' end || _r.from_name), 300),
              _pos);
    end if;
  end loop;

  if _added > 0 then
    insert into activities (account_id, contact_id, deal_id, type, title, user_id)
    values (_c.account_id, _contact, _deal, 'ai',
            'Oportunidade estimada pelo interesse (' || _added || ' ' || case when _added = 1 then 'item' else 'itens' end || ')',
            auth.uid());
  end if;
  return _deal;
end $$;
revoke execute on function public.build_opportunity(uuid) from public, anon;
grant execute on function public.build_opportunity(uuid) to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.deal_items;
exception when duplicate_object then null; when undefined_object then null; end $$;
