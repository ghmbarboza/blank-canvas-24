-- Frente B: SLA por plano/segmento do cliente.
-- Uma regra diz "cliente com a etiqueta X (ou campo Y = Z) no contato ou na empresa usa estes prazos".
-- A primeira regra que casa (menor position) vale; prioridade sem prazo na regra cai no SLA por prioridade.
-- Aditivo: tabela nova, coluna nova em tickets e os gatilhos passam a consultar sla_for_ticket.

create table if not exists public.sla_plan_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  match_kind text not null default 'tag' check (match_kind in ('tag','field')),
  match_field text check (match_field is null or length(trim(match_field)) between 1 and 60),
  match_value text not null check (length(trim(match_value)) between 1 and 120),
  applies_to text not null default 'any' check (applies_to in ('any','contact','company')),
  -- {"urgent":{"first":15,"resolution":120},"high":{...},"normal":{...},"low":{...}} em minutos
  targets jsonb not null default '{}'::jsonb check (jsonb_typeof(targets) = 'object'),
  business_hours boolean not null default true,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (match_kind = 'tag' or match_field is not null)
);
create index if not exists sla_plan_rules_account on public.sla_plan_rules (account_id, position);
alter table public.sla_plan_rules enable row level security;
drop policy if exists sla_plan_rules_select on public.sla_plan_rules;
create policy sla_plan_rules_select on public.sla_plan_rules for select using (public.is_member(account_id));
drop policy if exists sla_plan_rules_write on public.sla_plan_rules;
create policy sla_plan_rules_write on public.sla_plan_rules for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

alter table public.tickets add column if not exists sla_plan_rule_id uuid references public.sla_plan_rules(id) on delete set null;

-- Minutos válidos de uma meta (1 a 129600) ou null.
create or replace function public.sla_target_minutes(_targets jsonb, _priority text, _key text)
returns int language sql immutable set search_path = public as $$
  select case when jsonb_typeof(_targets->_priority->_key) = 'number'
               and (_targets->_priority->>_key)::numeric between 1 and 129600
              then floor((_targets->_priority->>_key)::numeric)::int end;
$$;

-- Regra de plano que casa com o contato/empresa do chamado (a primeira por position).
create or replace function public.sla_rule_for(_account uuid, _contact uuid, _company uuid)
returns public.sla_plan_rules
language sql stable security definer set search_path = public as $$
  with ct as (select tags, custom from public.contacts where id = _contact and account_id = _account),
       co as (select tags, custom from public.companies where id = _company and account_id = _account)
  select r.* from public.sla_plan_rules r
   where r.account_id = _account and r.is_active
     and (
       (r.applies_to in ('any','contact') and exists (
          select 1 from ct where
            (r.match_kind = 'tag' and exists (select 1 from unnest(ct.tags) t where lower(trim(t)) = lower(trim(r.match_value))))
            or (r.match_kind = 'field' and lower(trim(ct.custom->>r.match_field)) = lower(trim(r.match_value)))))
       or
       (r.applies_to in ('any','company') and exists (
          select 1 from co where
            (r.match_kind = 'tag' and exists (select 1 from unnest(co.tags) t where lower(trim(t)) = lower(trim(r.match_value))))
            or (r.match_kind = 'field' and lower(trim(co.custom->>r.match_field)) = lower(trim(r.match_value)))))
     )
   order by r.position, r.created_at
   limit 1;
$$;
-- Só os gatilhos (security definer) chamam: ninguém de fora consulta regra de outra conta.
revoke all on function public.sla_rule_for(uuid, uuid, uuid) from public, anon, authenticated;

-- Prazos efetivos do chamado: regra do plano (se casar e tiver a meta) ou o SLA por prioridade.
create or replace function public.sla_for_ticket(_account uuid, _priority text, _contact uuid, _company uuid)
returns table (first_response_minutes int, resolution_minutes int, business_hours boolean, policy_id uuid, rule_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare _base record; _rule public.sla_plan_rules; _f int; _r int;
begin
  select * into _base from public.sla_for(_account, _priority);
  if _contact is not null or _company is not null then
    _rule := public.sla_rule_for(_account, _contact, _company);
  end if;
  if _rule.id is not null then
    _f := public.sla_target_minutes(_rule.targets, _priority, 'first');
    _r := public.sla_target_minutes(_rule.targets, _priority, 'resolution');
    if _f is not null or _r is not null then
      return query select coalesce(_f, _base.first_response_minutes), coalesce(_r, _base.resolution_minutes),
                          _rule.business_hours, _base.policy_id, _rule.id;
      return;
    end if;
  end if;
  return query select _base.first_response_minutes, _base.resolution_minutes, _base.business_hours, _base.policy_id, null::uuid;
end $$;
revoke all on function public.sla_for_ticket(uuid, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_ticket_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare _sla record;
begin
  new.number := public.next_ticket_number(new.account_id);
  if new.contact_id is not null then
    if not exists (select 1 from public.contacts c where c.id = new.contact_id and c.account_id = new.account_id) then
      raise exception 'contato de outra conta' using errcode = '42501';
    end if;
    if new.company_id is null then
      select company_id into new.company_id from public.contacts where id = new.contact_id;
    end if;
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations v where v.id = new.conversation_id and v.account_id = new.account_id) then
    raise exception 'conversa de outra conta' using errcode = '42501';
  end if;
  select * into _sla from public.sla_for_ticket(new.account_id, new.priority, new.contact_id, new.company_id);
  new.sla_policy_id := _sla.policy_id;
  new.sla_plan_rule_id := _sla.rule_id;
  if _sla.business_hours then
    new.first_response_due_at := public.add_business_minutes(new.account_id, new.created_at, _sla.first_response_minutes);
    new.resolution_due_at := public.add_business_minutes(new.account_id, new.created_at, _sla.resolution_minutes);
  else
    new.first_response_due_at := new.created_at + make_interval(mins => _sla.first_response_minutes);
    new.resolution_due_at := new.created_at + make_interval(mins => _sla.resolution_minutes);
  end if;
  return new;
end $$;

create or replace function public.tg_ticket_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare _sla record;
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
    if new.status = 'closed' then new.closed_at := coalesce(new.closed_at, now()); new.resolved_at := coalesce(new.resolved_at, now()); end if;
    if new.status in ('open','pending','waiting_customer') then new.resolved_at := null; new.closed_at := null; end if;
  end if;
  if new.priority is distinct from old.priority and new.status in ('open','pending','waiting_customer') then
    select * into _sla from public.sla_for_ticket(new.account_id, new.priority, new.contact_id, new.company_id);
    new.sla_policy_id := _sla.policy_id;
    new.sla_plan_rule_id := _sla.rule_id;
    new.sla_warned_at := null;
    if _sla.business_hours then
      new.resolution_due_at := public.add_business_minutes(new.account_id, old.created_at, _sla.resolution_minutes);
      if new.first_response_at is null then
        new.first_response_due_at := public.add_business_minutes(new.account_id, old.created_at, _sla.first_response_minutes);
      end if;
    else
      new.resolution_due_at := old.created_at + make_interval(mins => _sla.resolution_minutes);
      if new.first_response_at is null then
        new.first_response_due_at := old.created_at + make_interval(mins => _sla.first_response_minutes);
      end if;
    end if;
  end if;
  return new;
end $$;
