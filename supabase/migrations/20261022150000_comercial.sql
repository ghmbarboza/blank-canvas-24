-- Comercial: propostas com aceite eletrônico, cobrança (Asaas), metas e comissão.
-- O acesso público à proposta passa só pelas rotas de servidor (/api/public/proposal), com service role.

-- ───────────────────────── numeração por conta (sem MAX+1) ─────────────────────────
create table if not exists public.account_counters (
  account_id uuid not null references public.accounts(id) on delete cascade,
  key text not null,
  value bigint not null default 0,
  primary key (account_id, key)
);
alter table public.account_counters enable row level security;

create or replace function public.next_counter(_account uuid, _key text) returns bigint
language sql security definer set search_path = public as $$
  insert into public.account_counters (account_id, key, value) values (_account, _key, 1)
  on conflict (account_id, key) do update set value = public.account_counters.value + 1
  returning value;
$$;
revoke all on function public.next_counter(uuid, text) from public, anon, authenticated;
grant execute on function public.next_counter(uuid, text) to service_role;

-- ───────────────────────── propostas ─────────────────────────
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  number bigint not null,
  version int not null default 1,
  parent_id uuid references public.proposals(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','expired')),
  valid_until date,
  items jsonb not null default '[]'::jsonb,
  one_time_total numeric(16,2) not null default 0,
  monthly_total numeric(16,2) not null default 0,
  yearly_total numeric(16,2) not null default 0,
  discount_total numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  conditions text,
  notes text,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  accepted_name text,
  accepted_document text,
  accepted_ip text,
  accepted_user_agent text,
  accepted_at timestamptz,
  declined_reason text,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, number, version)
);
create index if not exists proposals_deal on public.proposals (deal_id, created_at desc);
create index if not exists proposals_contact on public.proposals (contact_id) where contact_id is not null;
drop trigger if exists proposals_touch on public.proposals;
create trigger proposals_touch before update on public.proposals for each row execute function public.touch_updated_at();
alter table public.proposals enable row level security;

-- Quem vê o negócio vê a proposta (a RLS de deals já restringe o vendedor aos dele).
drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id));
drop policy if exists proposals_insert on public.proposals;
create policy proposals_insert on public.proposals for insert
  with check (public.is_member(account_id) and status = 'draft' and exists (select 1 from public.deals d where d.id = deal_id and d.account_id = proposals.account_id));
drop policy if exists proposals_update on public.proposals;
create policy proposals_update on public.proposals for update
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id) and status in ('draft','sent','viewed'))
  with check (public.is_member(account_id) and status in ('draft','sent','viewed','expired'));
drop policy if exists proposals_delete on public.proposals;
create policy proposals_delete on public.proposals for delete
  using (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = deal_id) and status = 'draft');

create table if not exists public.proposal_views (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  seconds int not null default 0 check (seconds between 0 and 86400),
  ip_hash text,
  user_agent text
);
create index if not exists proposal_views_proposal on public.proposal_views (proposal_id, viewed_at desc);
alter table public.proposal_views enable row level security;
drop policy if exists proposal_views_select on public.proposal_views;
create policy proposal_views_select on public.proposal_views for select
  using (public.is_member(account_id) and exists (select 1 from public.proposals p where p.id = proposal_id));

-- Itens congelados a partir dos itens aceitos do negócio (ou o valor do negócio, se não houver itens).
create or replace function public.proposal_items_from_deal(_deal uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object(
        'name', i.name, 'kind', i.kind, 'quantity', i.quantity, 'unit_price', i.unit_price,
        'discount_pct', i.discount_pct, 'billing', i.billing, 'product_id', i.product_id,
        'line_period', round(i.quantity * i.unit_price * (1 - i.discount_pct / 100), 2),
        'line_total', i.line_total) order by i.position, i.created_at)
     from public.deal_items i where i.deal_id = _deal and i.status = 'accepted'),
    (select jsonb_build_array(jsonb_build_object('name', d.title, 'kind', 'core', 'quantity', 1, 'unit_price', d.value,
        'discount_pct', 0, 'billing', 'one_time', 'product_id', null, 'line_period', d.value, 'line_total', d.value))
     from public.deals d where d.id = _deal and d.value > 0),
    '[]'::jsonb);
$$;
grant execute on function public.proposal_items_from_deal(uuid) to authenticated, service_role;

create or replace function public.proposal_totals(_items jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'one_time', coalesce(sum((x->>'line_period')::numeric) filter (where x->>'billing' = 'one_time'), 0),
    'monthly', coalesce(sum((x->>'line_period')::numeric) filter (where x->>'billing' = 'monthly'), 0),
    'yearly', coalesce(sum((x->>'line_period')::numeric) filter (where x->>'billing' = 'yearly'), 0),
    'discount', coalesce(sum((x->>'quantity')::numeric * (x->>'unit_price')::numeric * ((x->>'discount_pct')::numeric / 100)
                              * case x->>'billing' when 'monthly' then 12 else 1 end), 0),
    'total', coalesce(sum((x->>'line_total')::numeric), 0))
  from jsonb_array_elements(coalesce(_items, '[]'::jsonb)) x;
$$;

-- Cria uma proposta (ou nova versão) a partir do negócio. Security invoker: vale a RLS do negócio.
create or replace function public.create_proposal(_deal uuid, _title text default null, _valid_days int default 15,
  _conditions text default null, _notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare _d public.deals; _items jsonb; _t jsonb; _num bigint; _ver int := 1; _parent uuid; _id uuid; _company uuid;
begin
  select * into _d from public.deals where id = _deal;
  if not found then raise exception 'negócio não encontrado' using errcode = '42501'; end if;
  if not public.is_member(_d.account_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  _items := public.proposal_items_from_deal(_deal);
  if jsonb_array_length(_items) = 0 then raise exception 'Adicione itens ou um valor ao negócio antes de gerar a proposta' using errcode = '22023'; end if;
  _t := public.proposal_totals(_items);
  select id, number, version into _parent, _num, _ver from public.proposals where deal_id = _deal order by number desc, version desc limit 1;
  if _parent is null then
    _num := public.next_counter_member(_d.account_id, 'proposal');
    _ver := 1;
  else
    _ver := _ver + 1;
    update public.proposals set status = 'expired' where deal_id = _deal and status in ('draft','sent','viewed');
  end if;
  select company_id into _company from public.contacts where id = _d.contact_id;
  insert into public.proposals (account_id, deal_id, contact_id, company_id, number, version, parent_id, title, valid_until,
    items, one_time_total, monthly_total, yearly_total, discount_total, total, conditions, notes, created_by)
  values (_d.account_id, _deal, _d.contact_id, coalesce(_d.company_id, _company), _num, _ver, _parent,
    coalesce(nullif(trim(_title), ''), _d.title), current_date + greatest(1, least(coalesce(_valid_days, 15), 365)),
    _items, (_t->>'one_time')::numeric, (_t->>'monthly')::numeric, (_t->>'yearly')::numeric, (_t->>'discount')::numeric,
    (_t->>'total')::numeric, _conditions, _notes, auth.uid())
  returning id into _id;
  insert into public.activities (account_id, contact_id, deal_id, type, title, user_id, done_at)
  values (_d.account_id, _d.contact_id, _deal, 'note', 'Proposta nº ' || _num || ' v' || _ver || ' criada', auth.uid(), now());
  return _id;
end $$;
grant execute on function public.create_proposal(uuid, text, int, text, text) to authenticated;

-- Contador acessível a membros (só para o próprio uso nas funções acima).
create or replace function public.next_counter_member(_account uuid, _key text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.next_counter(_account, _key);
end $$;
revoke all on function public.next_counter_member(uuid, text) from public, anon;
grant execute on function public.next_counter_member(uuid, text) to authenticated, service_role;

-- Reatualiza os itens de um rascunho a partir do negócio.
create or replace function public.refresh_proposal(_proposal uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare _p public.proposals; _items jsonb; _t jsonb;
begin
  select * into _p from public.proposals where id = _proposal;
  if not found or _p.status <> 'draft' then raise exception 'Só rascunhos podem ser atualizados' using errcode = '22023'; end if;
  _items := public.proposal_items_from_deal(_p.deal_id);
  _t := public.proposal_totals(_items);
  update public.proposals set items = _items, one_time_total = (_t->>'one_time')::numeric, monthly_total = (_t->>'monthly')::numeric,
    yearly_total = (_t->>'yearly')::numeric, discount_total = (_t->>'discount')::numeric, total = (_t->>'total')::numeric
  where id = _proposal;
end $$;
grant execute on function public.refresh_proposal(uuid) to authenticated;

-- Move o negócio para a etapa de ganho do funil dele (ou para a última etapa aberta, se aguarda pagamento).
create or replace function public.move_deal_to(_deal uuid, _target text) returns void
language plpgsql security definer set search_path = public as $$
declare _d public.deals; _stage uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into _d from public.deals where id = _deal;
  if not found or _d.status <> 'open' then return; end if;
  if _target = 'won' then
    select id into _stage from public.pipeline_stages where pipeline_id = _d.pipeline_id and kind = 'won' order by position limit 1;
  else
    select id into _stage from public.pipeline_stages where pipeline_id = _d.pipeline_id and kind = 'open' order by position desc limit 1;
  end if;
  if _stage is not null and _stage <> _d.stage_id then
    update public.deals set stage_id = _stage where id = _deal;
  end if;
end $$;
revoke all on function public.move_deal_to(uuid, text) from public, anon, authenticated;
grant execute on function public.move_deal_to(uuid, text) to service_role;

-- ───────────────────────── cobranças ─────────────────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  description text,
  amount numeric(16,2) not null check (amount > 0),
  billing_type text not null default 'UNDEFINED' check (billing_type in ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  kind text not null default 'one_time' check (kind in ('one_time','subscription')),
  cycle text check (cycle is null or cycle in ('MONTHLY','YEARLY')),
  status text not null default 'pending' check (status in ('pending','confirmed','received','overdue','refunded','canceled')),
  due_date date,
  invoice_url text,
  pix_payload text,
  asaas_customer_id text,
  asaas_payment_id text unique,
  asaas_subscription_id text,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_deal on public.payments (deal_id);
create index if not exists payments_subscription on public.payments (asaas_subscription_id) where asaas_subscription_id is not null;
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
alter table public.payments enable row level security;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (public.is_member(account_id) and (deal_id is null and public.is_manager(account_id) or exists (select 1 from public.deals d where d.id = deal_id)));

-- ───────────────────────── metas ─────────────────────────
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  user_id uuid references auth.users(id) on delete cascade,
  metric text not null check (metric in ('revenue','deals_won','meetings','calls','new_leads')),
  target numeric(16,2) not null check (target > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists goals_unique on public.goals (account_id, period, metric, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.goals enable row level security;
drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals for select using (public.is_member(account_id));
drop policy if exists goals_write on public.goals;
create policy goals_write on public.goals for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── comissão ─────────────────────────
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  user_id uuid references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  category text,
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.commission_rules enable row level security;
drop policy if exists commission_rules_select on public.commission_rules;
create policy commission_rules_select on public.commission_rules for select using (public.is_member(account_id));
drop policy if exists commission_rules_write on public.commission_rules;
create policy commission_rules_write on public.commission_rules for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.commission_rules(id) on delete set null,
  base numeric(16,2) not null,
  percent numeric(5,2) not null,
  amount numeric(16,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','canceled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists commissions_user on public.commissions (account_id, user_id, created_at desc);
create unique index if not exists commissions_deal_rule on public.commissions (deal_id, user_id, coalesce(rule_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status <> 'canceled';
alter table public.commissions enable row level security;
drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select
  using (public.is_member(account_id) and (user_id = auth.uid() or public.is_manager(account_id)));
drop policy if exists commissions_update on public.commissions;
create policy commissions_update on public.commissions for update using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Regra mais específica vence: usuário+produto > produto > categoria > funil > usuário > geral.
create or replace function public.commission_rule_for(_account uuid, _user uuid, _product uuid, _category text, _pipeline uuid)
returns public.commission_rules language sql stable set search_path = public as $$
  select r.* from public.commission_rules r
  where r.account_id = _account and r.active
    and (r.user_id is null or r.user_id = _user)
    and (r.product_id is null or r.product_id = _product)
    and (r.category is null or r.category = _category)
    and (r.pipeline_id is null or r.pipeline_id = _pipeline)
  order by (r.product_id is not null)::int * 8 + (r.category is not null)::int * 4 + (r.pipeline_id is not null)::int * 2
           + (r.user_id is not null)::int desc, r.created_at
  limit 1;
$$;

create or replace function public.compute_commissions(_deal uuid) returns int
language plpgsql security definer set search_path = public as $$
declare _d public.deals; _n int := 0; r record;
begin
  select * into _d from public.deals where id = _deal;
  if not found then return 0; end if;
  if _d.status <> 'won' then
    update public.commissions set status = 'canceled' where deal_id = _deal and status = 'pending';
    return 0;
  end if;
  if _d.owner_user_id is null or exists (select 1 from public.commissions where deal_id = _deal and status <> 'canceled') then return 0; end if;
  for r in
    with lines as (
      select i.line_total as base, i.product_id, p.category
      from public.deal_items i left join public.products p on p.id = i.product_id
      where i.deal_id = _deal and i.status = 'accepted'
      union all
      select _d.value, null, null where not exists (select 1 from public.deal_items i where i.deal_id = _deal and i.status = 'accepted')
    ), ruled as (
      select l.base, (public.commission_rule_for(_d.account_id, _d.owner_user_id, l.product_id, l.category, _d.pipeline_id)).*
      from lines l where l.base > 0
    )
    select id as rule_id, percent, sum(base) as base from ruled where id is not null group by id, percent
  loop
    insert into public.commissions (account_id, deal_id, user_id, rule_id, base, percent, amount)
    values (_d.account_id, _deal, _d.owner_user_id, r.rule_id, r.base, r.percent, round(r.base * r.percent / 100, 2));
    _n := _n + 1;
  end loop;
  return _n;
end $$;
revoke all on function public.compute_commissions(uuid) from public, anon, authenticated;
grant execute on function public.compute_commissions(uuid) to service_role;

create or replace function public.tg_deal_commissions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and (new.status = 'won' or old.status = 'won') then
    perform public.compute_commissions(new.id);
  end if;
  return new;
end $$;
drop trigger if exists deals_commissions on public.deals;
create trigger deals_commissions after update of status, stage_id on public.deals
  for each row execute function public.tg_deal_commissions();

-- Progresso das metas do mês (security invoker: o vendedor vê o que a RLS deixa).
create or replace function public.goals_progress(_account uuid, _period date default date_trunc('month', now())::date)
returns table (goal_id uuid, user_id uuid, metric text, target numeric, achieved numeric)
language sql stable security invoker set search_path = public as $$
  with g as (select * from public.goals where account_id = _account and period = date_trunc('month', _period)::date),
  bounds as (select date_trunc('month', _period) s, date_trunc('month', _period) + interval '1 month' e)
  select g.id, g.user_id, g.metric, g.target,
    case g.metric
      when 'revenue' then (select coalesce(sum(d.value), 0) from public.deals d, bounds b where d.account_id = _account and d.status = 'won'
                            and d.closed_at >= b.s and d.closed_at < b.e and (g.user_id is null or d.owner_user_id = g.user_id))
      when 'deals_won' then (select count(*) from public.deals d, bounds b where d.account_id = _account and d.status = 'won'
                            and d.closed_at >= b.s and d.closed_at < b.e and (g.user_id is null or d.owner_user_id = g.user_id))
      when 'meetings' then (select count(*) from public.events e, bounds b where e.account_id = _account and e.status in ('done','confirmed','scheduled')
                            and e.starts_at >= b.s and e.starts_at < b.e and e.starts_at < now() and (g.user_id is null or e.owner_user_id = g.user_id))
      when 'calls' then (select count(*) from public.activities a, bounds b where a.account_id = _account and a.type = 'call' and a.done_at is not null
                            and a.done_at >= b.s and a.done_at < b.e and (g.user_id is null or a.user_id = g.user_id))
      when 'new_leads' then (select count(*) from public.contacts c, bounds b where c.account_id = _account
                            and c.created_at >= b.s and c.created_at < b.e and (g.user_id is null or c.owner_user_id = g.user_id))
    end::numeric
  from g;
$$;
grant execute on function public.goals_progress(uuid, date) to authenticated;

-- ───────────────────────── linha do tempo ─────────────────────────
create or replace function public.timeline_part_comercial(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'proposal'::text, p.id, coalesce(p.accepted_at, p.sent_at, p.created_at),
         'Proposta nº ' || p.number || case when p.version > 1 then ' v' || p.version else '' end || ' · ' ||
           case p.status when 'draft' then 'rascunho' when 'sent' then 'enviada' when 'viewed' then 'vista'
             when 'accepted' then 'aceita' when 'declined' then 'recusada' else 'expirada' end,
         p.title, jsonb_build_object('status', p.status, 'total', p.total, 'deal_id', p.deal_id, 'views', p.view_count)
  from public.proposals p where p.contact_id = _contact
  union all
  select 'payment', y.id, coalesce(y.paid_at, y.created_at),
         case when y.status in ('confirmed','received') then 'Pagamento confirmado' else 'Cobrança gerada' end,
         y.description, jsonb_build_object('status', y.status, 'amount', y.amount, 'billing_type', y.billing_type, 'deal_id', y.deal_id)
  from public.payments y where y.contact_id = _contact;
$$;
grant execute on function public.timeline_part_comercial(uuid) to authenticated;
