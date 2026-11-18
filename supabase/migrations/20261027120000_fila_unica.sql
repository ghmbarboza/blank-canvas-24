-- Call center: fila única de trabalho (work_items) para ligação, conversa, chamado, retorno,
-- passagem da IA e tarefa de cadência. A fonte da verdade continua em calls / conversations /
-- tickets: os gatilhos abaixo só espelham o estado na fila, sem duplicar dado de negócio.
-- Atendentes: habilidades com nível, capacidade por canal e presença. Roteamento por
-- SLA a estourar > valor do cliente > chegada, com reserva FOR UPDATE SKIP LOCKED e prazo.
-- Aditivo e idempotente.

-- ───────────────────────── configuração da central ─────────────────────────
create table if not exists public.call_center_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  reservation_seconds int not null default 30 check (reservation_seconds between 10 and 300),
  owner_wait_seconds int not null default 120 check (owner_wait_seconds between 0 and 3600),
  sla_risk_seconds int not null default 120 check (sla_risk_seconds between 0 and 86400),
  auto_callback_on_abandon boolean not null default true,
  offer_callback boolean not null default true,
  offer_whatsapp boolean not null default true,
  -- Regras de discagem: tudo desligado por padrão. Ligar ou não é escolha da empresa cliente.
  dialing jsonb not null default '{}'::jsonb check (jsonb_typeof(dialing) = 'object'),
  dialing_accepted_at timestamptz,
  dialing_accepted_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
drop trigger if exists call_center_settings_touch on public.call_center_settings;
create trigger call_center_settings_touch before update on public.call_center_settings
  for each row execute function public.touch_updated_at();
alter table public.call_center_settings enable row level security;
drop policy if exists call_center_settings_select on public.call_center_settings;
create policy call_center_settings_select on public.call_center_settings for select using (public.is_member(account_id));
drop policy if exists call_center_settings_write on public.call_center_settings;
create policy call_center_settings_write on public.call_center_settings for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── filas: call_queues vira fila de qualquer canal ─────────────────────────
alter table public.call_queues add column if not exists channels text[] not null default array['voice']::text[];
alter table public.call_queues add column if not exists is_active boolean not null default true;
alter table public.call_queues add column if not exists required_level smallint not null default 1;
alter table public.call_queues add column if not exists overflow_redirect text;
alter table public.call_queues add column if not exists description text;
do $$ begin
  alter table public.call_queues add constraint call_queues_required_level_chk check (required_level between 1 and 5);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.call_queues add constraint call_queues_overflow_redirect_chk
    check (overflow_redirect is null or overflow_redirect ~ '^([0-9]{1,6}|[0-9]+-[0-9a-z]+)$');
exception when duplicate_object then null; end $$;

-- ───────────────────────── atendentes ─────────────────────────
create table if not exists public.queue_agents (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  -- "1 ligação OU 4 chats OU 6 e-mails": cada item ocupa 1/capacidade do canal; a soma vai até 1.
  cap_voice smallint not null default 1 check (cap_voice between 0 and 3),
  cap_chat smallint not null default 4 check (cap_chat between 0 and 20),
  cap_email smallint not null default 6 check (cap_email between 0 and 50),
  cap_task smallint not null default 6 check (cap_task between 0 and 50),
  wrap_up_seconds int not null default 60 check (wrap_up_seconds between 0 and 1800),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
alter table public.queue_agents enable row level security;
drop policy if exists queue_agents_select on public.queue_agents;
create policy queue_agents_select on public.queue_agents for select using (public.is_member(account_id));
drop policy if exists queue_agents_write on public.queue_agents;
create policy queue_agents_write on public.queue_agents for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.agent_skills (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null check (skill = lower(trim(skill)) and length(skill) between 1 and 40),
  level smallint not null default 3 check (level between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id, skill)
);
alter table public.agent_skills enable row level security;
drop policy if exists agent_skills_select on public.agent_skills;
create policy agent_skills_select on public.agent_skills for select using (public.is_member(account_id));
drop policy if exists agent_skills_write on public.agent_skills;
create policy agent_skills_write on public.agent_skills for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- Presença escolhida pelo atendente. "Em atendimento" é derivado da carga, nunca gravado.
create table if not exists public.agent_presence (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'offline' check (status in ('offline','available','paused')),
  pause_reason text check (pause_reason is null or length(pause_reason) <= 60),
  wrap_up_until timestamptz,
  since timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
alter table public.agent_presence enable row level security;
drop policy if exists agent_presence_select on public.agent_presence;
create policy agent_presence_select on public.agent_presence for select using (public.is_member(account_id));
-- Escrita só pela RPC set_presence (security definer).

create table if not exists public.agent_presence_log (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  pause_reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists agent_presence_log_user on public.agent_presence_log (account_id, user_id, started_at desc);
alter table public.agent_presence_log enable row level security;
drop policy if exists agent_presence_log_select on public.agent_presence_log;
create policy agent_presence_log_select on public.agent_presence_log for select using (public.is_member(account_id));

create or replace function public.tg_agent_presence_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.pause_reason is not distinct from old.pause_reason then
    return new;
  end if;
  update public.agent_presence_log set ended_at = now()
   where account_id = new.account_id and user_id = new.user_id and ended_at is null;
  insert into public.agent_presence_log (account_id, user_id, status, pause_reason)
  values (new.account_id, new.user_id, new.status, new.pause_reason);
  return new;
end $$;
drop trigger if exists agent_presence_log on public.agent_presence;
create trigger agent_presence_log after insert or update on public.agent_presence
  for each row execute function public.tg_agent_presence_log();

-- ───────────────────────── fila única ─────────────────────────
create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('call','conversation','ticket','callback','cadence_task','handoff')),
  channel text not null check (length(channel) between 1 and 30),
  capacity_class text not null check (capacity_class in ('voice','chat','email','task')),
  source_table text not null default 'manual' check (source_table in ('calls','conversations','tickets','activities','manual')),
  source_id uuid,
  contact_id uuid references public.contacts(id) on delete set null,
  queue_id uuid references public.call_queues(id) on delete set null,
  subject text check (subject is null or length(subject) <= 200),
  summary text check (summary is null or length(summary) <= 4000),
  phone text,
  priority smallint not null default 50 check (priority between 0 and 100),
  required_skill text check (required_skill is null or required_skill = lower(trim(required_skill))),
  required_level smallint not null default 1 check (required_level between 1 and 5),
  sla_due_at timestamptz,
  customer_value numeric(14,2) not null default 0,
  preferred_user_id uuid references auth.users(id) on delete set null,
  preferred_until timestamptz,
  status text not null default 'queued' check (status in ('queued','reserved','assigned','wrap_up','done','abandoned','canceled')),
  reserved_user_id uuid references auth.users(id) on delete set null,
  reserved_until timestamptz,
  declined_by uuid[] not null default '{}',
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  scheduled_at timestamptz,
  ended_at timestamptz,
  handled_by text not null default 'human' check (handled_by in ('human','ai')),
  wrap jsonb not null default '{}'::jsonb,
  wrap_reason text check (wrap_reason is null or length(wrap_reason) <= 120),
  wrap_result text check (wrap_result is null or length(wrap_result) <= 120),
  wrap_next_action text check (wrap_next_action is null or length(wrap_next_action) <= 300),
  wrap_confirmed_at timestamptz,
  wrap_confirmed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  close_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_items_active_source on public.work_items (source_table, source_id)
  where source_id is not null and status in ('queued','reserved','assigned','wrap_up');
create index if not exists work_items_open on public.work_items (account_id, status, created_at)
  where status in ('queued','reserved');
create index if not exists work_items_user on public.work_items (account_id, assigned_user_id)
  where status in ('assigned','wrap_up');
create index if not exists work_items_closed on public.work_items (account_id, closed_at desc);
create index if not exists work_items_created on public.work_items (account_id, created_at desc);
create index if not exists work_items_contact on public.work_items (contact_id, created_at desc) where contact_id is not null;
drop trigger if exists work_items_touch on public.work_items;
create trigger work_items_touch before update on public.work_items for each row execute function public.touch_updated_at();
alter table public.work_items enable row level security;
drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select using (public.is_member(account_id));
-- Escrita só por gatilho e RPC (security definer): a fila nunca fica fora de ordem por um update solto.

do $$ begin alter publication supabase_realtime add table public.work_items;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.agent_presence;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ───────────────────────── funções de apoio ─────────────────────────
create or replace function public.cc_settings(_account uuid) returns public.call_center_settings
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s from public.call_center_settings s where s.account_id = _account),
    jsonb_populate_record(null::public.call_center_settings, jsonb_build_object(
      'account_id', _account, 'reservation_seconds', 30, 'owner_wait_seconds', 120, 'sla_risk_seconds', 120,
      'auto_callback_on_abandon', true, 'offer_callback', true, 'offer_whatsapp', true, 'dialing', '{}'::jsonb)));
$$;
revoke all on function public.cc_settings(uuid) from public, anon, authenticated;

create or replace function public.cc_capacity_class(_channel text) returns text
language sql immutable set search_path = public as $$
  select case
    when _channel in ('voice','phone','whatsapp_call','callback') then 'voice'
    when _channel = 'email' then 'email'
    when _channel in ('ticket','task','cadence') then 'task'
    else 'chat' end;
$$;

-- Valor do cliente: negócios abertos + 12x a receita recorrente anotada (custom.mrr) no contato
-- ou na empresa. É só critério de desempate depois do SLA.
create or replace function public.cc_customer_value(_account uuid, _contact uuid) returns numeric
language sql stable security definer set search_path = public as $$
  with c as (select id, company_id, custom from public.contacts where id = _contact and account_id = _account),
  deals as (select coalesce(sum(d.value), 0) v from public.deals d, c
             where d.account_id = _account and d.status = 'open'
               and (d.contact_id = c.id or (c.company_id is not null and d.company_id = c.company_id))),
  mrr as (select coalesce(
             case when (c.custom->>'mrr') ~ '^[0-9]+([.,][0-9]+)?$' then replace(c.custom->>'mrr', ',', '.')::numeric end,
             (select case when (co.custom->>'mrr') ~ '^[0-9]+([.,][0-9]+)?$' then replace(co.custom->>'mrr', ',', '.')::numeric end
                from public.companies co where co.id = c.company_id), 0) v from c)
  select least(coalesce((select v from deals), 0) + 12 * coalesce((select v from mrr), 0), 999999999999);
$$;
revoke all on function public.cc_customer_value(uuid, uuid) from public, anon, authenticated;

-- Dono preferencial: quem cuida do caso aberto do cliente (chamado, depois conversa), senão o dono do contato.
create or replace function public.cc_preferred_user(_account uuid, _contact uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.owner_user_id from public.tickets t
      where t.account_id = _account and t.contact_id = _contact and t.owner_user_id is not null
        and t.status in ('open','pending','waiting_customer')
      order by t.updated_at desc limit 1),
    (select v.assignee_user_id from public.conversations v
      where v.account_id = _account and v.contact_id = _contact and v.assignee_user_id is not null
        and v.status in ('open','pending','snoozed')
      order by v.last_message_at desc nulls last limit 1),
    (select owner_user_id from public.contacts where id = _contact and account_id = _account));
$$;
revoke all on function public.cc_preferred_user(uuid, uuid) from public, anon, authenticated;

create or replace function public.cc_queue_for(_account uuid, _channel text, _queue uuid default null)
returns public.call_queues language sql stable security definer set search_path = public as $$
  select q.* from public.call_queues q
   where q.account_id = _account and q.is_active
     and (q.id = _queue or (_queue is null and _channel = any(q.channels)))
   order by (q.id = _queue) desc nulls last, q.created_at
   limit 1;
$$;
revoke all on function public.cc_queue_for(uuid, text, uuid) from public, anon, authenticated;

-- Carga atual do atendente (0 = livre, 1 = cheio), somando 1/capacidade de cada item ativo.
create or replace function public.cc_agent_load(_account uuid, _user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(1.0 / nullif(case w.capacity_class
            when 'voice' then qa.cap_voice when 'chat' then qa.cap_chat
            when 'email' then qa.cap_email else qa.cap_task end, 0)), 0)
    from public.work_items w
    join public.queue_agents qa on qa.account_id = w.account_id and qa.user_id = _user
   where w.account_id = _account
     and ((w.status = 'assigned' and w.assigned_user_id = _user)
       or (w.status = 'reserved' and w.reserved_user_id = _user and w.reserved_until >= now()));
$$;
revoke all on function public.cc_agent_load(uuid, uuid) from public, anon, authenticated;

create or replace function public.cc_fits(_qa public.queue_agents, _load numeric, _class text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(case _class when 'voice' then _qa.cap_voice when 'chat' then _qa.cap_chat
                              when 'email' then _qa.cap_email else _qa.cap_task end, 0) > 0
     and _load + 1.0 / case _class when 'voice' then _qa.cap_voice when 'chat' then _qa.cap_chat
                                   when 'email' then _qa.cap_email else _qa.cap_task end <= 1.0001;
$$;

-- Atendente apto a receber agora (presença disponível, fora do pós-atendimento).
create or replace function public.cc_user_available(_account uuid, _user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agent_presence p join public.queue_agents qa
                   on qa.account_id = p.account_id and qa.user_id = p.user_id and qa.is_active
                  where p.account_id = _account and p.user_id = _user and p.status = 'available'
                    and coalesce(p.wrap_up_until, '-infinity') <= now());
$$;
revoke all on function public.cc_user_available(uuid, uuid) from public, anon, authenticated;

create or replace function public.cc_has_skill(_account uuid, _user uuid, _skill text, _level int) returns boolean
language sql stable security definer set search_path = public as $$
  select _skill is null or exists (select 1 from public.agent_skills k
     where k.account_id = _account and k.user_id = _user and k.skill = _skill and k.level >= coalesce(_level, 1));
$$;
revoke all on function public.cc_has_skill(uuid, uuid, text, int) from public, anon, authenticated;

create or replace function public.cc_at_risk(_due timestamptz, _risk_seconds int) returns boolean
language sql stable set search_path = public as $$
  select _due is not null and _due <= now() + make_interval(secs => coalesce(_risk_seconds, 120));
$$;

-- Atribui o item e reflete na fonte (conversa ganha responsável; chamado ganha dono).
create or replace function public.cc_assign(_item uuid, _user uuid) returns public.work_items
language plpgsql security definer set search_path = public as $$
declare w public.work_items;
begin
  update public.work_items
     set status = 'assigned', assigned_user_id = _user, assigned_at = coalesce(assigned_at, now()),
         reserved_user_id = null, reserved_until = null
   where id = _item returning * into w;
  if w.source_table = 'conversations' then
    update public.conversations set assignee_user_id = _user
     where id = w.source_id and assignee_user_id is distinct from _user;
  elsif w.source_table = 'tickets' then
    update public.tickets set owner_user_id = _user
     where id = w.source_id and owner_user_id is distinct from _user;
  end if;
  return w;
end $$;
revoke all on function public.cc_assign(uuid, uuid) from public, anon, authenticated;

-- Entra em pós-atendimento: a IA preenche resumo, tabulação e próxima ação (job workitem.wrapup).
create or replace function public.cc_to_wrap_up(_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.work_items; _secs int;
begin
  update public.work_items set status = 'wrap_up', ended_at = coalesce(ended_at, now())
   where id = _item and status in ('assigned','reserved','queued') returning * into w;
  if w.id is null then return; end if;
  if w.assigned_user_id is null then
    update public.work_items set status = 'done', closed_at = now(), close_reason = coalesce(close_reason, 'encerrado sem atendente')
     where id = w.id;
    return;
  end if;
  if w.capacity_class = 'voice' then
    select wrap_up_seconds into _secs from public.queue_agents where account_id = w.account_id and user_id = w.assigned_user_id;
    update public.agent_presence set wrap_up_until = now() + make_interval(secs => coalesce(_secs, 60))
     where account_id = w.account_id and user_id = w.assigned_user_id and coalesce(_secs, 60) > 0;
  end if;
  perform public.enqueue_job(w.account_id, 'workitem.wrapup', jsonb_build_object('work_item_id', w.id),
                             now() + interval '5 seconds', 'workitem.wrapup:' || w.id);
end $$;
revoke all on function public.cc_to_wrap_up(uuid) from public, anon, authenticated;

-- ───────────────────────── espelho: ligações ─────────────────────────
create or replace function public.tg_work_from_call() returns trigger
language plpgsql security definer set search_path = public as $$
declare w public.work_items; q public.call_queues; s public.call_center_settings; _key text; _ch text;
begin
  -- Espelhar a fila nunca pode derrubar a gravação da fonte: erro vira aviso no log.
  begin
  -- Só ligação recebida que precisa de gente. A ligação da IA aparece nos indicadores pela própria calls.
  if new.direction <> 'inbound' or new.voice_agent_id is not null then
    -- Saída de um atendente com um retorno atribuído para o mesmo número: liga o retorno à ligação.
    if new.direction = 'outbound' and new.user_id is not null and tg_op = 'INSERT' then
      _key := right(regexp_replace(coalesce(new.to_number, ''), '\D', '', 'g'), 8);
      if length(_key) = 8 then
        update public.work_items set metadata = metadata || jsonb_build_object('call_id', new.id)
         where account_id = new.account_id and kind = 'callback' and status = 'assigned'
           and assigned_user_id = new.user_id
           and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = _key;
      end if;
    end if;
    return new;
  end if;
  _ch := coalesce(nullif(new.metadata->>'channel', ''), 'voice');
  select * into w from public.work_items where source_table = 'calls' and source_id = new.id
     and status in ('queued','reserved','assigned','wrap_up') limit 1;

  if w.id is null and new.status in ('ringing','in_progress') then
    -- Passagem da IA (URA que conversa) para o mesmo número nos últimos 10 min: vira esta ligação.
    _key := right(regexp_replace(coalesce(new.from_number, ''), '\D', '', 'g'), 8);
    if length(_key) = 8 then
      update public.work_items
         set kind = 'call', source_table = 'calls', source_id = new.id,
             metadata = metadata || jsonb_build_object('handoff', true)
       where id = (select h.id from public.work_items h
                    where h.account_id = new.account_id and h.kind = 'handoff' and h.status in ('queued','reserved')
                      and h.created_at > now() - interval '10 minutes'
                      and right(regexp_replace(coalesce(h.phone, ''), '\D', '', 'g'), 8) = _key
                    order by h.created_at desc limit 1)
      returning * into w;
    end if;
    if w.id is null then
      q := public.cc_queue_for(new.account_id, 'voice', new.queue_id);
      s := public.cc_settings(new.account_id);
      insert into public.work_items (account_id, kind, channel, capacity_class, source_table, source_id,
             contact_id, queue_id, phone, priority, required_skill, required_level, sla_due_at,
             customer_value, preferred_user_id, preferred_until, subject, created_at)
      values (new.account_id, 'call', _ch, 'voice', 'calls', new.id, new.contact_id, q.id,
             new.from_number, 60, q.skills[1], coalesce(q.required_level, 1),
             new.started_at + make_interval(secs => coalesce(q.sla_seconds, 20)),
             case when new.contact_id is null then 0 else public.cc_customer_value(new.account_id, new.contact_id) end,
             case when new.contact_id is null then null else public.cc_preferred_user(new.account_id, new.contact_id) end,
             now() + make_interval(secs => s.owner_wait_seconds),
             'Ligação de ' || coalesce(new.from_number, 'número oculto'), new.started_at)
      on conflict do nothing
      returning * into w;
    end if;
  end if;
  if w.id is null then return new; end if;

  if new.status = 'in_progress' and new.user_id is not null and w.status in ('queued','reserved') then
    perform public.cc_assign(w.id, new.user_id);
    update public.work_items set assigned_at = coalesce(new.answered_at, now()) where id = w.id;
  elsif new.status in ('completed','voicemail') and new.answered_at is not null then
    if w.status in ('queued','reserved') and new.user_id is not null then
      perform public.cc_assign(w.id, new.user_id);
    end if;
    update public.work_items set ended_at = coalesce(new.ended_at, now()) where id = w.id;
    perform public.cc_to_wrap_up(w.id);
  elsif new.status in ('missed','no_answer','busy','failed','canceled') and w.status in ('queued','reserved','assigned') then
    update public.work_items set status = 'abandoned', closed_at = now(), ended_at = now(),
           close_reason = coalesce(new.disposition_reason, 'cliente desistiu antes de ser atendido')
     where id = w.id;
    s := public.cc_settings(new.account_id);
    if s.auto_callback_on_abandon and new.from_number is not null then
      insert into public.work_items (account_id, kind, channel, capacity_class, contact_id, queue_id, phone,
             priority, required_skill, required_level, sla_due_at, customer_value, preferred_user_id,
             preferred_until, subject, metadata)
      values (new.account_id, 'callback', 'voice', 'voice', new.contact_id, w.queue_id, new.from_number,
             70, w.required_skill, w.required_level, now() + interval '30 minutes', w.customer_value,
             w.preferred_user_id, now() + make_interval(secs => s.owner_wait_seconds),
             'Retornar ligação perdida de ' || new.from_number,
             jsonb_build_object('abandoned_call_id', new.id, 'auto', true));
    end if;
  end if;
  return new;
  exception when others then
    raise warning 'fila única (%): %', tg_table_name, sqlerrm;
    return new;
  end;
end $$;
drop trigger if exists calls_work_items on public.calls;
create trigger calls_work_items after insert or update of status, user_id, answered_at, ended_at on public.calls
  for each row execute function public.tg_work_from_call();

-- ───────────────────────── espelho: conversas ─────────────────────────
create or replace function public.tg_work_from_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
declare w public.work_items; q public.call_queues; s public.call_center_settings; _platform text; _needs boolean;
begin
  -- Espelhar a fila nunca pode derrubar a gravação da fonte: erro vira aviso no log.
  begin
  if new.is_group then return new; end if;
  _needs := new.status in ('open','pending') and (not new.ai_enabled or new.ai_handoff_at is not null);
  select * into w from public.work_items where source_table = 'conversations' and source_id = new.id
     and status in ('queued','reserved','assigned','wrap_up') limit 1;

  if new.status = 'closed' then
    if w.id is not null and w.status <> 'wrap_up' then
      if w.status = 'assigned' then perform public.cc_to_wrap_up(w.id);
      else update public.work_items set status = 'canceled', closed_at = now(),
             close_reason = 'conversa encerrada antes de alguém pegar' where id = w.id;
      end if;
    end if;
    return new;
  end if;

  if w.id is null then
    -- Só entra na fila quando precisa de gente e tem mensagem do cliente esperando (ou já tem responsável).
    if not _needs or (coalesce(new.unread_count, 0) = 0 and new.assignee_user_id is null) then return new; end if;
    select platform into _platform from public.channels where id = new.channel_id;
    _platform := coalesce(_platform, 'chat');
    q := public.cc_queue_for(new.account_id, _platform);
    s := public.cc_settings(new.account_id);
    insert into public.work_items (account_id, kind, channel, capacity_class, source_table, source_id,
           contact_id, queue_id, priority, required_skill, required_level, sla_due_at, customer_value,
           preferred_user_id, preferred_until, subject, summary, scheduled_at, created_at)
    values (new.account_id, 'conversation', _platform, public.cc_capacity_class(_platform), 'conversations', new.id,
           new.contact_id, q.id, 50, q.skills[1], coalesce(q.required_level, 1),
           coalesce(new.last_inbound_at, now()) + make_interval(secs => greatest(coalesce(q.sla_seconds, 20), 300)),
           case when new.contact_id is null then 0 else public.cc_customer_value(new.account_id, new.contact_id) end,
           case when new.contact_id is null then null else public.cc_preferred_user(new.account_id, new.contact_id) end,
           now() + make_interval(secs => s.owner_wait_seconds),
           coalesce(new.title, 'Conversa'), left(new.last_message_preview, 300),
           case when new.status = 'snoozed' then new.snoozed_until end, now())
    on conflict do nothing
    returning * into w;
    if w.id is null then return new; end if;
    if new.assignee_user_id is not null then perform public.cc_assign(w.id, new.assignee_user_id); end if;
    return new;
  end if;

  -- Item já existe: acompanha responsável, adiamento e devolução para a IA.
  if w.status = 'wrap_up' then return new; end if;
  if new.assignee_user_id is not null and new.assignee_user_id is distinct from w.assigned_user_id then
    perform public.cc_assign(w.id, new.assignee_user_id);
  elsif new.assignee_user_id is null and w.status = 'assigned' then
    update public.work_items set status = 'queued', assigned_user_id = null, assigned_at = null where id = w.id;
  end if;
  update public.work_items
     set scheduled_at = case when new.status = 'snoozed' then new.snoozed_until else null end,
         summary = coalesce(left(new.last_message_preview, 300), summary)
   where id = w.id;
  if not _needs and new.status <> 'snoozed' and w.status in ('queued','reserved') then
    update public.work_items set status = 'canceled', closed_at = now(), close_reason = 'a IA voltou a atender'
     where id = w.id;
  end if;
  return new;
  exception when others then
    raise warning 'fila única (%): %', tg_table_name, sqlerrm;
    return new;
  end;
end $$;
drop trigger if exists conversations_work_items on public.conversations;
create trigger conversations_work_items
  after insert or update of status, assignee_user_id, ai_enabled, ai_handoff_at, unread_count, snoozed_until
  on public.conversations for each row execute function public.tg_work_from_conversation();

-- ───────────────────────── espelho: chamados ─────────────────────────
create or replace function public.tg_work_from_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare w public.work_items; q public.call_queues; s public.call_center_settings; _ch text; _due timestamptz; _prio int;
begin
  -- Espelhar a fila nunca pode derrubar a gravação da fonte: erro vira aviso no log.
  begin
  select * into w from public.work_items where source_table = 'tickets' and source_id = new.id
     and status in ('queued','reserved','assigned','wrap_up') limit 1;
  _due := case when new.first_response_at is null then coalesce(new.first_response_due_at, new.resolution_due_at)
               else new.resolution_due_at end;
  _prio := case new.priority when 'urgent' then 90 when 'high' then 70 when 'low' then 30 else 50 end;

  if new.status in ('resolved','closed') then
    if w.id is not null and w.status <> 'wrap_up' then
      if w.status = 'assigned' then perform public.cc_to_wrap_up(w.id);
      else update public.work_items set status = 'done', closed_at = now(), close_reason = 'chamado resolvido' where id = w.id;
      end if;
    end if;
    return new;
  end if;

  if w.id is null then
    _ch := case when new.source = 'email' then 'email' else 'ticket' end;
    q := public.cc_queue_for(new.account_id, _ch);
    s := public.cc_settings(new.account_id);
    insert into public.work_items (account_id, kind, channel, capacity_class, source_table, source_id,
           contact_id, queue_id, priority, required_skill, required_level, sla_due_at, customer_value,
           preferred_user_id, preferred_until, subject, summary, created_at)
    values (new.account_id, 'ticket', _ch, case when _ch = 'email' then 'email' else 'task' end, 'tickets', new.id,
           new.contact_id, q.id, _prio,
           coalesce(nullif(lower(trim(coalesce(new.team, ''))), ''), q.skills[1]), coalesce(q.required_level, 1),
           _due,
           case when new.contact_id is null then 0 else public.cc_customer_value(new.account_id, new.contact_id) end,
           case when new.contact_id is null then null else public.cc_preferred_user(new.account_id, new.contact_id) end,
           now() + make_interval(secs => s.owner_wait_seconds),
           left(new.subject, 200), left(new.description, 300), new.created_at)
    on conflict do nothing
    returning * into w;
    if w.id is null then return new; end if;
    if new.owner_user_id is not null then perform public.cc_assign(w.id, new.owner_user_id); end if;
    return new;
  end if;

  if w.status = 'wrap_up' then return new; end if;
  update public.work_items set priority = _prio, sla_due_at = _due, subject = left(new.subject, 200) where id = w.id;
  if new.owner_user_id is not null and new.owner_user_id is distinct from w.assigned_user_id then
    perform public.cc_assign(w.id, new.owner_user_id);
  elsif new.owner_user_id is null and w.status = 'assigned' then
    update public.work_items set status = 'queued', assigned_user_id = null, assigned_at = null where id = w.id;
  end if;
  return new;
  exception when others then
    raise warning 'fila única (%): %', tg_table_name, sqlerrm;
    return new;
  end;
end $$;
drop trigger if exists tickets_work_items on public.tickets;
create trigger tickets_work_items
  after insert or update of status, owner_user_id, priority, first_response_at, resolution_due_at
  on public.tickets for each row execute function public.tg_work_from_ticket();

-- ───────────────────────── presença ─────────────────────────
create or replace function public.set_presence(_account uuid, _status text, _reason text default null)
returns public.agent_presence language plpgsql security definer set search_path = public as $$
declare p public.agent_presence;
begin
  if auth.uid() is null or not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _status not in ('offline','available','paused') then
    raise exception 'Estado inválido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.queue_agents where account_id = _account and user_id = auth.uid() and is_active) then
    raise exception 'Você ainda não está na equipe de atendimento. Peça ao gestor para incluir você.' using errcode = 'P0001';
  end if;
  insert into public.agent_presence (account_id, user_id, status, pause_reason, since)
  values (_account, auth.uid(), _status, case when _status = 'paused' then left(nullif(trim(_reason), ''), 60) end, now())
  on conflict (account_id, user_id) do update
     set status = excluded.status, pause_reason = excluded.pause_reason,
         since = case when agent_presence.status is distinct from excluded.status then now() else agent_presence.since end,
         updated_at = now()
  returning * into p;
  -- Reservas pendentes voltam para a fila se a pessoa saiu.
  if _status <> 'available' then
    update public.work_items set status = 'queued', reserved_user_id = null, reserved_until = null
     where account_id = _account and status = 'reserved' and reserved_user_id = auth.uid();
  end if;
  return p;
end $$;
revoke all on function public.set_presence(uuid, text, text) from public, anon;
grant execute on function public.set_presence(uuid, text, text) to authenticated;

-- ───────────────────────── reserva e atendimento ─────────────────────────
-- O atendente pede o próximo: o melhor item que ele pode pegar, travado com SKIP LOCKED.
-- Ordem: SLA a estourar (pelo prazo) > valor do cliente > prioridade > chegada.
create or replace function public.claim_next_work_item(_account uuid, _accept boolean default true)
returns public.work_items language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); qa public.queue_agents; p public.agent_presence; s public.call_center_settings;
        _load numeric; w public.work_items;
begin
  if _me is null or not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into qa from public.queue_agents where account_id = _account and user_id = _me and is_active;
  if qa.user_id is null then
    raise exception 'Você ainda não está na equipe de atendimento' using errcode = 'P0001';
  end if;
  -- Trava a própria presença: duas abas do mesmo atendente não estouram a capacidade.
  select * into p from public.agent_presence where account_id = _account and user_id = _me for update;
  if p.user_id is null or p.status <> 'available' then
    raise exception 'Fique disponível para receber atendimento' using errcode = 'P0001';
  end if;
  if coalesce(p.wrap_up_until, '-infinity') > now() then
    raise exception 'Conclua o pós-atendimento antes de pegar o próximo' using errcode = 'P0001';
  end if;
  s := public.cc_settings(_account);
  _load := public.cc_agent_load(_account, _me);

  select x.* into w from public.work_items x
   where x.account_id = _account
     and (x.status = 'queued' or (x.status = 'reserved' and (x.reserved_until < now() or x.reserved_user_id = _me)))
     and (x.scheduled_at is null or x.scheduled_at <= now())
     and not (_me = any(x.declined_by))
     and (public.cc_fits(qa, _load, x.capacity_class) or (x.status = 'reserved' and x.reserved_user_id = _me))
     and public.cc_has_skill(_account, _me, x.required_skill, x.required_level)
     and (x.preferred_user_id is null or x.preferred_user_id = _me or x.preferred_until < now()
          or not public.cc_user_available(_account, x.preferred_user_id))
   order by (x.status = 'reserved' and x.reserved_user_id = _me) desc,
            public.cc_at_risk(x.sla_due_at, s.sla_risk_seconds) desc,
            case when public.cc_at_risk(x.sla_due_at, s.sla_risk_seconds) then x.sla_due_at end asc nulls last,
            x.customer_value desc, x.priority desc, x.created_at asc
   limit 1
   for update of x skip locked;
  if w.id is null then return null; end if;
  if _accept then
    return public.cc_assign(w.id, _me);
  end if;
  update public.work_items set status = 'reserved', reserved_user_id = _me,
         reserved_until = now() + make_interval(secs => s.reservation_seconds)
   where id = w.id returning * into w;
  return w;
end $$;
revoke all on function public.claim_next_work_item(uuid, boolean) from public, anon;
grant execute on function public.claim_next_work_item(uuid, boolean) to authenticated;

-- Empurra um item para o melhor atendente livre (ligação tocando). Só o servidor chama.
-- Preferido primeiro, depois menor carga, depois quem está livre há mais tempo.
create or replace function public.route_work_item(_item uuid)
returns table (user_id uuid, extension text, reserved_until timestamptz)
language plpgsql security definer set search_path = public as $$
declare w public.work_items; s public.call_center_settings; c record; qa public.queue_agents; _until timestamptz;
begin
  select * into w from public.work_items where id = _item for update skip locked;
  if w.id is null or w.status <> 'queued' then return; end if;
  s := public.cc_settings(w.account_id);
  for c in
    select a.user_id as uid, p.since
      from public.queue_agents a
      join public.agent_presence p on p.account_id = a.account_id and p.user_id = a.user_id
     where a.account_id = w.account_id and a.is_active and p.status = 'available'
       and coalesce(p.wrap_up_until, '-infinity') <= now()
       and not (a.user_id = any(w.declined_by))
       and public.cc_has_skill(w.account_id, a.user_id, w.required_skill, w.required_level)
     order by (a.user_id = w.preferred_user_id) desc nulls last,
              public.cc_agent_load(w.account_id, a.user_id) asc, p.since asc
  loop
    -- Trava o atendente: duas ligações simultâneas não caem na mesma pessoa além da capacidade.
    perform 1 from public.agent_presence ap where ap.account_id = w.account_id and ap.user_id = c.uid
      for update skip locked;
    if not found then continue; end if;
    select * into qa from public.queue_agents qa2 where qa2.account_id = w.account_id and qa2.user_id = c.uid;
    if not public.cc_fits(qa, public.cc_agent_load(w.account_id, c.uid), w.capacity_class) then continue; end if;
    _until := now() + make_interval(secs => s.reservation_seconds);
    update public.work_items wi set status = 'reserved', reserved_user_id = c.uid, reserved_until = _until where wi.id = w.id;
    return query select c.uid,
      (select e.extension from public.telephony_extensions e
        where e.account_id = w.account_id and e.user_id = c.uid and e.is_active limit 1), _until;
    return;
  end loop;
end $$;
revoke all on function public.route_work_item(uuid) from public, anon, authenticated;
grant execute on function public.route_work_item(uuid) to service_role;

create or replace function public.accept_work_item(_item uuid) returns public.work_items
language plpgsql security definer set search_path = public as $$
declare w public.work_items; qa public.queue_agents; _me uuid := auth.uid();
begin
  select * into w from public.work_items where id = _item for update;
  if w.id is null or _me is null or not public.is_member(w.account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if w.status = 'assigned' and w.assigned_user_id = _me then return w; end if;
  if w.status = 'reserved' and w.reserved_user_id = _me and w.reserved_until >= now() then
    return public.cc_assign(w.id, _me);
  end if;
  if w.status in ('queued','reserved') and (w.status = 'queued' or w.reserved_until < now()) then
    select * into qa from public.queue_agents where account_id = w.account_id and user_id = _me and is_active;
    if qa.user_id is null then raise exception 'Você ainda não está na equipe de atendimento' using errcode = 'P0001'; end if;
    if not public.cc_has_skill(w.account_id, _me, w.required_skill, w.required_level) and not public.is_manager(w.account_id) then
      raise exception 'Este atendimento pede a habilidade "%"', w.required_skill using errcode = 'P0001';
    end if;
    if not public.cc_fits(qa, public.cc_agent_load(w.account_id, _me), w.capacity_class) then
      raise exception 'Você já está com a capacidade cheia neste canal' using errcode = 'P0001';
    end if;
    return public.cc_assign(w.id, _me);
  end if;
  raise exception 'Outra pessoa já pegou este atendimento' using errcode = 'P0001';
end $$;
revoke all on function public.accept_work_item(uuid) from public, anon;
grant execute on function public.accept_work_item(uuid) to authenticated;

create or replace function public.decline_work_item(_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.work_items;
begin
  select * into w from public.work_items where id = _item for update;
  if w.id is null or not public.is_member(w.account_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if w.status = 'reserved' and w.reserved_user_id = auth.uid() then
    update public.work_items set status = 'queued', reserved_user_id = null, reserved_until = null,
           declined_by = array_append(declined_by, auth.uid())
     where id = w.id;
  end if;
end $$;
revoke all on function public.decline_work_item(uuid) from public, anon;
grant execute on function public.decline_work_item(uuid) to authenticated;

-- Concluir à mão (retorno, tarefa, passagem). Ligação, conversa e chamado concluem pela fonte.
create or replace function public.finish_work_item(_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.work_items;
begin
  select * into w from public.work_items where id = _item;
  if w.id is null or not public.is_member(w.account_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if w.assigned_user_id is distinct from auth.uid() and not public.is_manager(w.account_id) then
    raise exception 'Só quem está atendendo pode concluir' using errcode = 'P0001';
  end if;
  perform public.cc_to_wrap_up(w.id);
end $$;
revoke all on function public.finish_work_item(uuid) from public, anon;
grant execute on function public.finish_work_item(uuid) to authenticated;

-- O atendente confirma (ou corrige) o que a IA preencheu. Próxima ação vira tarefa do contato.
create or replace function public.confirm_wrap_up(_item uuid, _reason text, _result text, _next_action text,
                                                  _next_due timestamptz default null)
returns public.work_items language plpgsql security definer set search_path = public as $$
declare w public.work_items;
begin
  select * into w from public.work_items where id = _item for update;
  if w.id is null or not public.is_member(w.account_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if w.status <> 'wrap_up' then raise exception 'Este atendimento não está em pós-atendimento' using errcode = 'P0001'; end if;
  if w.assigned_user_id is distinct from auth.uid() and not public.is_manager(w.account_id) then
    raise exception 'Só quem atendeu pode concluir o pós-atendimento' using errcode = 'P0001';
  end if;
  update public.work_items
     set status = 'done', closed_at = now(), close_reason = coalesce(close_reason, 'atendido'),
         wrap_reason = left(nullif(trim(_reason), ''), 120), wrap_result = left(nullif(trim(_result), ''), 120),
         wrap_next_action = left(nullif(trim(_next_action), ''), 300),
         wrap_confirmed_at = now(), wrap_confirmed_by = auth.uid()
   where id = w.id returning * into w;
  if w.contact_id is not null and w.wrap_next_action is not null then
    insert into public.activities (account_id, contact_id, type, title, body, due_at, user_id)
    values (w.account_id, w.contact_id, 'task', left(w.wrap_next_action, 200), w.wrap->>'summary',
            coalesce(_next_due, now() + interval '1 day'), coalesce(w.assigned_user_id, auth.uid()));
  end if;
  if w.source_table = 'calls' and w.source_id is not null then
    update public.calls set disposition_reason = coalesce(w.wrap_result, disposition_reason),
           summary = coalesce(summary, w.wrap->>'summary')
     where id = w.source_id;
  end if;
  -- Sai do pós-atendimento quando não sobra nenhum outro de voz em aberto.
  if not exists (select 1 from public.work_items x where x.account_id = w.account_id and x.assigned_user_id = w.assigned_user_id
                   and x.status = 'wrap_up' and x.capacity_class = 'voice') then
    update public.agent_presence set wrap_up_until = null where account_id = w.account_id and user_id = w.assigned_user_id;
  end if;
  return w;
end $$;
revoke all on function public.confirm_wrap_up(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.confirm_wrap_up(uuid, text, text, text, timestamptz) to authenticated;

-- Retorno de ligação no lugar de esperar na fila (cliente, URA com IA ou atendente pedem).
create or replace function public.request_callback(_account uuid, _phone text, _contact uuid default null,
       _when timestamptz default null, _note text default null, _skill text default null,
       _preferred uuid default null)
returns public.work_items language plpgsql security definer set search_path = public as $$
declare w public.work_items; q public.call_queues; s public.call_center_settings; _digits text;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or not public.is_member(_account)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  _digits := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  if length(_digits) < 8 or length(_digits) > 15 then
    raise exception 'Telefone inválido para o retorno' using errcode = 'P0001';
  end if;
  if _contact is not null and not exists (select 1 from public.contacts where id = _contact and account_id = _account) then
    raise exception 'contato de outra conta' using errcode = '42501';
  end if;
  -- Já existe retorno aberto para o mesmo número: atualiza em vez de duplicar.
  select * into w from public.work_items
   where account_id = _account and kind = 'callback' and status in ('queued','reserved','assigned')
     and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = right(_digits, 8)
   limit 1 for update;
  if w.id is not null then
    update public.work_items set scheduled_at = coalesce(_when, scheduled_at),
           summary = coalesce(left(_note, 4000), summary) where id = w.id returning * into w;
    return w;
  end if;
  q := public.cc_queue_for(_account, 'voice');
  s := public.cc_settings(_account);
  insert into public.work_items (account_id, kind, channel, capacity_class, contact_id, queue_id, phone, priority,
         required_skill, required_level, sla_due_at, customer_value, preferred_user_id, preferred_until,
         scheduled_at, subject, summary)
  values (_account, 'callback', 'voice', 'voice', _contact, q.id, '+' || _digits, 65,
         coalesce(nullif(lower(trim(_skill)), ''), q.skills[1]), coalesce(q.required_level, 1),
         coalesce(_when, now()) + interval '30 minutes',
         case when _contact is null then 0 else public.cc_customer_value(_account, _contact) end,
         coalesce(_preferred, case when _contact is null then null else public.cc_preferred_user(_account, _contact) end),
         coalesce(_when, now()) + make_interval(secs => s.owner_wait_seconds),
         _when, 'Retornar ligação para +' || _digits, left(_note, 4000))
  returning * into w;
  return w;
end $$;
revoke all on function public.request_callback(uuid, text, uuid, timestamptz, text, text, uuid) from public, anon;
grant execute on function public.request_callback(uuid, text, uuid, timestamptz, text, text, uuid) to authenticated, service_role;

-- Porta genérica para outras áreas (cadência, passagem da IA): entra na mesma fila.
create or replace function public.enqueue_work_item(_account uuid, _kind text, _channel text, _subject text,
       _contact uuid default null, _summary text default null, _skill text default null, _priority int default 50,
       _due timestamptz default null, _scheduled timestamptz default null, _preferred uuid default null,
       _phone text default null, _metadata jsonb default '{}'::jsonb)
returns public.work_items language plpgsql security definer set search_path = public as $$
declare w public.work_items; q public.call_queues; s public.call_center_settings;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or not public.is_member(_account)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _kind not in ('callback','cadence_task','handoff') then
    raise exception 'Tipo de item inválido' using errcode = 'P0001';
  end if;
  if _contact is not null and not exists (select 1 from public.contacts where id = _contact and account_id = _account) then
    raise exception 'contato de outra conta' using errcode = '42501';
  end if;
  q := public.cc_queue_for(_account, _channel);
  s := public.cc_settings(_account);
  insert into public.work_items (account_id, kind, channel, capacity_class, contact_id, queue_id, phone, priority,
         required_skill, required_level, sla_due_at, customer_value, preferred_user_id, preferred_until,
         scheduled_at, subject, summary, metadata)
  values (_account, _kind, _channel, public.cc_capacity_class(_channel), _contact, q.id, _phone,
         greatest(0, least(100, coalesce(_priority, 50))),
         coalesce(nullif(lower(trim(_skill)), ''), q.skills[1]), coalesce(q.required_level, 1),
         _due, case when _contact is null then 0 else public.cc_customer_value(_account, _contact) end,
         coalesce(_preferred, case when _contact is null then null else public.cc_preferred_user(_account, _contact) end),
         now() + make_interval(secs => s.owner_wait_seconds), _scheduled, left(_subject, 200), left(_summary, 4000),
         coalesce(_metadata, '{}'::jsonb))
  returning * into w;
  return w;
end $$;
revoke all on function public.enqueue_work_item(uuid, text, text, text, uuid, text, text, int, timestamptz, timestamptz, uuid, text, jsonb) from public, anon;
grant execute on function public.enqueue_work_item(uuid, text, text, text, uuid, text, text, int, timestamptz, timestamptz, uuid, text, jsonb) to authenticated, service_role;

-- Disponibilidade para uma habilidade (a URA com IA usa para dizer a espera e oferecer retorno).
create or replace function public.cc_availability(_account uuid, _skill text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _free int; _agents int; _waiting int; _tma numeric;
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select count(*) filter (where public.cc_user_available(_account, a.user_id)
                            and public.cc_fits(a, public.cc_agent_load(_account, a.user_id), 'voice')),
         count(*) filter (where public.cc_user_available(_account, a.user_id))
    into _free, _agents
    from public.queue_agents a
   where a.account_id = _account and a.is_active and public.cc_has_skill(_account, a.user_id, nullif(lower(trim(_skill)), ''), 1);
  select count(*) into _waiting from public.work_items
   where account_id = _account and status in ('queued','reserved') and capacity_class = 'voice'
     and (_skill is null or required_skill is not distinct from nullif(lower(trim(_skill)), ''));
  select coalesce(avg(extract(epoch from coalesce(ended_at, closed_at) - assigned_at)), 180) into _tma
    from public.work_items where account_id = _account and capacity_class = 'voice' and assigned_at is not null
     and coalesce(ended_at, closed_at) > now() - interval '7 days';
  return jsonb_build_object('free_agents', _free, 'available_agents', _agents, 'waiting', _waiting,
    'estimated_wait_seconds', case when _free > 0 then 0 when _agents = 0 then null
                                   else round(_tma * (_waiting + 1) / greatest(_agents, 1)) end);
end $$;
revoke all on function public.cc_availability(uuid, text) from public, anon;
grant execute on function public.cc_availability(uuid, text) to authenticated, service_role;

-- Tarefa periódica: reserva vencida volta para a fila; pós-atendimento esquecido fecha em 24 h.
create or replace function public.cc_housekeeping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare _r int; _w int;
begin
  update public.work_items set status = 'queued', reserved_user_id = null, reserved_until = null,
         declined_by = case when reserved_user_id is null then declined_by else array_append(declined_by, reserved_user_id) end
   where status = 'reserved' and reserved_until < now() - interval '5 seconds';
  get diagnostics _r = row_count;
  update public.work_items set status = 'done', closed_at = now(), close_reason = 'pós-atendimento não confirmado'
   where status = 'wrap_up' and ended_at < now() - interval '24 hours';
  get diagnostics _w = row_count;
  update public.agent_presence set wrap_up_until = null where wrap_up_until < now() - interval '1 minute';
  return jsonb_build_object('reservations_released', _r, 'wrapups_closed', _w);
end $$;
revoke all on function public.cc_housekeeping() from public, anon, authenticated;
grant execute on function public.cc_housekeeping() to service_role;
