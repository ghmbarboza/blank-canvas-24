-- Gestão da operação (P9, P7, P13): escalas e previsão, importador, sincronização com o CRM que o
-- cliente já tem, saúde do cliente, modelos por segmento e indicadores históricos do gestor.
-- Só aditivo e idempotente. Escrita das tabelas de integração passa pelo servidor (service_role);
-- o navegador só lê, e só gestor.

-- ───────────────────────── escala: parâmetros ─────────────────────────
create table if not exists public.workforce_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  service_level_pct smallint not null default 80 check (service_level_pct between 50 and 99),
  answer_seconds integer not null default 20 check (answer_seconds between 5 and 3600),
  shrinkage_pct smallint not null default 30 check (shrinkage_pct between 0 and 70),
  chat_concurrency smallint not null default 3 check (chat_concurrency between 1 and 10),
  aht_seconds jsonb not null default '{}'::jsonb,       -- {"voice": 240, "whatsapp": 420} sobrepõe o histórico
  weeks_history smallint not null default 8 check (weeks_history between 2 and 26),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.workforce_settings enable row level security;
drop trigger if exists workforce_settings_touch on public.workforce_settings;
create trigger workforce_settings_touch before update on public.workforce_settings
  for each row execute function public.touch_updated_at();
drop policy if exists workforce_settings_select on public.workforce_settings;
create policy workforce_settings_select on public.workforce_settings for select using (public.is_member(account_id));
drop policy if exists workforce_settings_write on public.workforce_settings;
create policy workforce_settings_write on public.workforce_settings for all
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── escala: turnos com pausas ─────────────────────────
create table if not exists public.workforce_shifts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  channel text not null default 'any' check (channel in ('any','voice','chat','email','ticket')),
  breaks jsonb not null default '[]'::jsonb,            -- [{"start": iso, "end": iso, "label": "Almoço"}]
  note text check (note is null or length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '16 hours'),
  check (jsonb_typeof(breaks) = 'array')
);
create index if not exists workforce_shifts_account_time on public.workforce_shifts (account_id, starts_at);
create index if not exists workforce_shifts_user_time on public.workforce_shifts (user_id, starts_at);
alter table public.workforce_shifts enable row level security;
drop trigger if exists workforce_shifts_touch on public.workforce_shifts;
create trigger workforce_shifts_touch before update on public.workforce_shifts
  for each row execute function public.touch_updated_at();
drop policy if exists workforce_shifts_select on public.workforce_shifts;
create policy workforce_shifts_select on public.workforce_shifts for select using (public.is_member(account_id));
drop policy if exists workforce_shifts_insert on public.workforce_shifts;
create policy workforce_shifts_insert on public.workforce_shifts for insert
  with check (public.is_manager(account_id)
    and exists (select 1 from public.memberships m where m.account_id = workforce_shifts.account_id and m.user_id = workforce_shifts.user_id and m.is_active));
drop policy if exists workforce_shifts_update on public.workforce_shifts;
create policy workforce_shifts_update on public.workforce_shifts for update
  using (public.is_manager(account_id)) with check (public.is_manager(account_id));
drop policy if exists workforce_shifts_delete on public.workforce_shifts;
create policy workforce_shifts_delete on public.workforce_shifts for delete using (public.is_manager(account_id));

-- ───────────────────────── escala: histórico de volume por hora e canal ─────────────────────────
-- Chegadas por dia e hora (no fuso da conta): ligação recebida (voz), conversa com mensagem do
-- cliente naquela hora (por rede) e chamado aberto. handle_seconds = tempo médio de atendimento
-- quando a fonte tem (ligação atendida por humano).
create or replace function public.workforce_history(_account uuid, _weeks int default 8)
returns table (channel text, day date, hour int, arrivals int, handle_seconds numeric)
language plpgsql stable security invoker set search_path = public as $$
declare
  _tz text;
  _since timestamptz;
begin
  if auth.role() <> 'service_role' and not public.is_manager(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(nullif(a.timezone, ''), 'America/Sao_Paulo') into _tz from public.accounts a where a.id = _account;
  _since := date_trunc('day', now() at time zone _tz) at time zone _tz - make_interval(days => 7 * greatest(2, least(coalesce(_weeks, 8), 26)));
  return query
  with voice as (
    select 'voice'::text ch, (c.started_at at time zone _tz) lt,
           case when c.answered_at is not null and c.voice_agent_id is null then coalesce(c.billseconds, c.duration_seconds) end hs
      from public.calls c
     where c.account_id = _account and c.direction = 'inbound' and c.started_at >= _since
  ),
  chat as (
    select ch.platform::text ch, date_trunc('hour', m.created_at at time zone _tz) lt, null::numeric hs, m.conversation_id
      from public.messages m
      join public.conversations cv on cv.id = m.conversation_id
      join public.channels ch on ch.id = cv.channel_id
     where m.account_id = _account and m.created_at >= _since and m.direction = 'in' and not m.is_private
  ),
  tick as (
    select 'ticket'::text ch, (t.created_at at time zone _tz) lt, null::numeric hs
      from public.tickets t where t.account_id = _account and t.created_at >= _since
  ),
  allrows as (
    select v.ch, v.lt, v.hs from voice v
    union all
    select x.ch, x.lt, null::numeric from (select distinct c2.ch, c2.lt, c2.conversation_id from chat c2) x
    union all
    select t2.ch, t2.lt, t2.hs from tick t2
  )
  select r.ch, r.lt::date, extract(hour from r.lt)::int, count(*)::int, round(avg(r.hs), 1)
    from allrows r
   group by 1, 2, 3
   order by 2, 3, 1;
end $$;
revoke all on function public.workforce_history(uuid, int) from public, anon;
grant execute on function public.workforce_history(uuid, int) to authenticated, service_role;

-- ───────────────────────── escala: presença (contrato com a frente do call center) ─────────────────────────
-- A presença do atendente nasce em outra área. O contrato é uma view public.agent_presence_log com
-- (account_id uuid, user_id uuid, status text, started_at timestamptz, ended_at timestamptz null),
-- status em 'available' | 'busy' | 'break' | 'offline'. Sem a view, devolve available=false e o
-- cálculo de aderência fica pronto esperando a fonte.
create or replace function public.workforce_presence(_account uuid, _from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _rows jsonb;
begin
  if auth.role() <> 'service_role' and not public.is_manager(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _to <= _from or _to - _from > interval '35 days' then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if to_regclass('public.agent_presence_log') is null then
    return jsonb_build_object('available', false, 'rows', '[]'::jsonb);
  end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'status', p.status,
             'started_at', p.started_at, 'ended_at', p.ended_at) order by p.started_at), '[]'::jsonb)
      from public.agent_presence_log p
     where p.account_id = $1 and p.started_at < $3 and coalesce(p.ended_at, now()) > $2
  $q$ into _rows using _account, _from, _to;
  return jsonb_build_object('available', true, 'rows', _rows);
end $$;
revoke all on function public.workforce_presence(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.workforce_presence(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ───────────────────────── importador guiado ─────────────────────────
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  source text not null check (source in ('planilha','rdstation','kommo','pipedrive','hubspot')),
  file_name text check (file_name is null or length(file_name) <= 200),
  status text not null default 'running' check (status in ('running','done','failed')),
  mapping jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists import_batches_account on public.import_batches (account_id, created_at desc);
alter table public.import_batches enable row level security;
drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches for select using (public.is_manager(account_id));

-- ───────────────────────── vínculo com sistemas de fora (origem de cada registro) ─────────────────────────
create table if not exists public.external_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('rdstation_crm','hubspot','import')),
  entity text not null check (entity in ('contact','company','deal')),
  local_id uuid not null,
  external_id text not null check (length(external_id) between 1 and 200),
  remote_updated_at timestamptz,
  local_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider, entity, external_id),
  unique (account_id, provider, entity, local_id)
);
create index if not exists external_links_local on public.external_links (local_id);
alter table public.external_links enable row level security;
drop trigger if exists external_links_touch on public.external_links;
create trigger external_links_touch before update on public.external_links
  for each row execute function public.touch_updated_at();
drop policy if exists external_links_select on public.external_links;
create policy external_links_select on public.external_links for select using (public.is_member(account_id));

create table if not exists public.crm_sync_connections (
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('rdstation_crm','hubspot')),
  status text not null default 'pending' check (status in ('pending','connected','error','paused')),
  direction text not null default 'both' check (direction in ('both','pull','push')),
  settings jsonb not null default '{}'::jsonb,          -- {"pipeline_id": uuid local para negócios trazidos}
  cursors jsonb not null default '{}'::jsonb,           -- {"contact": iso, "company": iso, "deal": iso}
  connected_label text,
  last_sync_at timestamptz,
  last_result jsonb,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, provider)
);
alter table public.crm_sync_connections enable row level security;
drop trigger if exists crm_sync_connections_touch on public.crm_sync_connections;
create trigger crm_sync_connections_touch before update on public.crm_sync_connections
  for each row execute function public.touch_updated_at();
drop policy if exists crm_sync_connections_select on public.crm_sync_connections;
create policy crm_sync_connections_select on public.crm_sync_connections for select using (public.is_manager(account_id));

create table if not exists public.crm_sync_log (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  run_id uuid,
  entity text not null check (entity in ('contact','company','deal')),
  direction text not null check (direction in ('pull','push')),
  action text not null check (action in ('created','updated','skipped','conflict','error')),
  local_id uuid,
  external_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_sync_log_account on public.crm_sync_log (account_id, created_at desc);
alter table public.crm_sync_log enable row level security;
drop policy if exists crm_sync_log_select on public.crm_sync_log;
create policy crm_sync_log_select on public.crm_sync_log for select using (public.is_manager(account_id));

-- ───────────────────────── customer success: sinais de saúde ─────────────────────────
-- Uma linha por cliente (contato em lifecycle customer). A nota e o motivo saem no front
-- (src/features/gestao/health.ts), a partir destes números.
create or replace function public.customer_health_signals(_account uuid)
returns table (
  contact_id uuid, name text, company_name text, owner_user_id uuid, customer_since timestamptz,
  last_interaction_at timestamptz, inbound_30d int, inbound_prev_30d int, open_tickets int,
  breached_tickets int, csat_avg_90d numeric, nps_last smallint, overdue_payments int,
  mrr numeric, next_renewal_at date, won_value_12m numeric
)
language plpgsql stable security invoker set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, coalesce(co.name, c.company), c.owner_user_id,
         coalesce((select min(d.closed_at) from public.deals d where d.contact_id = c.id and d.status = 'won'), c.created_at),
         c.last_interaction_at,
         (select count(*)::int from public.messages m join public.conversations cv on cv.id = m.conversation_id
           where cv.contact_id = c.id and m.direction = 'in' and m.created_at >= now() - interval '30 days'),
         (select count(*)::int from public.messages m join public.conversations cv on cv.id = m.conversation_id
           where cv.contact_id = c.id and m.direction = 'in' and m.created_at >= now() - interval '60 days'
             and m.created_at < now() - interval '30 days'),
         (select count(*)::int from public.tickets t where t.contact_id = c.id and t.status in ('open','pending','waiting_customer')),
         (select count(*)::int from public.tickets t where t.contact_id = c.id and t.sla_breached and t.created_at >= now() - interval '90 days'),
         (select round(avg(r.score)::numeric, 2) from public.csat_responses r where r.contact_id = c.id and r.answered_at >= now() - interval '90 days'),
         (select r.score from public.nps_responses r where r.contact_id = c.id and r.answered_at is not null order by r.answered_at desc limit 1),
         (select count(*)::int from public.payments p where p.contact_id = c.id and p.status = 'overdue'),
         (select coalesce(sum(case when p.cycle = 'YEARLY' then p.amount / 12 else p.amount end), 0) from (
            select distinct on (coalesce(p2.asaas_subscription_id, p2.id::text)) p2.amount, p2.cycle from public.payments p2
             where p2.contact_id = c.id and p2.kind = 'subscription' and p2.status in ('confirmed','received','pending','overdue')
               and p2.created_at >= now() - interval '120 days'
             order by coalesce(p2.asaas_subscription_id, p2.id::text), p2.created_at desc) p),
         coalesce(
           (select min(p.due_date) from public.payments p where p.contact_id = c.id and p.kind = 'subscription'
              and p.status in ('pending','overdue') and p.due_date >= current_date - 30),
           (select (max(d.closed_at) + interval '12 months')::date from public.deals d where d.contact_id = c.id and d.status = 'won')),
         (select coalesce(sum(d.value), 0) from public.deals d where d.contact_id = c.id and d.status = 'won' and d.closed_at >= now() - interval '12 months')
    from public.contacts c
    left join public.companies co on co.id = c.company_id
   where c.account_id = _account and c.lifecycle = 'customer'
   order by c.last_interaction_at desc nulls last
   limit 2000;
end $$;
revoke all on function public.customer_health_signals(uuid) from public, anon;
grant execute on function public.customer_health_signals(uuid) to authenticated, service_role;

-- ───────────────────────── modelos por segmento ─────────────────────────
-- Cada área guarda aqui o modelo que outras frentes leem depois (agentes de IA, formulário de
-- qualidade...). Coordenação só por dados: ninguém depende da tabela do outro.
create table if not exists public.account_templates (
  account_id uuid not null references public.accounts(id) on delete cascade,
  area text not null check (area ~ '^[a-z_]{2,40}$'),
  template_key text not null check (template_key ~ '^[a-z0-9_]{2,40}$'),
  payload jsonb not null default '{}'::jsonb,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  primary key (account_id, area)
);
alter table public.account_templates enable row level security;
drop policy if exists account_templates_select on public.account_templates;
create policy account_templates_select on public.account_templates for select using (public.is_member(account_id));

-- Aplica um modelo de uma vez: funis e etapas (por nome), campos (por chave), respostas rápidas
-- (por atalho), cadências (por template_key, em rascunho) e o jsonb das outras áreas.
-- Idempotente: rodar de novo não duplica nada e devolve o que já existia.
create or replace function public.apply_segment_template(_account uuid, _key text, _model jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _p jsonb; _s jsonb; _f jsonb; _q jsonb; _c jsonb;
  _pipeline uuid; _pos int; _has_default boolean;
  _out jsonb := jsonb_build_object('pipelines', 0, 'stages', 0, 'fields', 0, 'macros', 0, 'cadences', 0);
  _n int;
begin
  if auth.role() <> 'service_role' and not public.is_manager(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _key !~ '^[a-z0-9_]{2,30}$' or jsonb_typeof(_model) <> 'object' then
    raise exception 'invalid template' using errcode = '22023';
  end if;
  select exists (select 1 from public.pipelines where account_id = _account) into _has_default;

  for _p in select * from jsonb_array_elements(coalesce(_model->'pipelines', '[]'::jsonb)) loop
    select id into _pipeline from public.pipelines
     where account_id = _account and lower(name) = lower(_p->>'name') limit 1;
    if _pipeline is null then
      select coalesce(max(position), -1) + 1 into _pos from public.pipelines where account_id = _account;
      insert into public.pipelines (account_id, name, position, is_default)
      values (_account, left(_p->>'name', 80), _pos, not _has_default)
      returning id into _pipeline;
      _has_default := true;
      _out := jsonb_set(_out, '{pipelines}', to_jsonb((_out->>'pipelines')::int + 1));
    end if;
    _pos := 0;
    for _s in select * from jsonb_array_elements(coalesce(_p->'stages', '[]'::jsonb)) loop
      if not exists (select 1 from public.pipeline_stages where pipeline_id = _pipeline and lower(name) = lower(_s->>'name')) then
        insert into public.pipeline_stages (account_id, pipeline_id, name, position, color, probability, kind)
        values (_account, _pipeline, left(_s->>'name', 60),
                coalesce((select max(position) + 1 from public.pipeline_stages where pipeline_id = _pipeline), _pos),
                coalesce(_s->>'color', 'slate'), greatest(0, least(100, coalesce((_s->>'probability')::int, 10))),
                case when _s->>'kind' in ('open','won','lost') then _s->>'kind' else 'open' end);
        _out := jsonb_set(_out, '{stages}', to_jsonb((_out->>'stages')::int + 1));
      end if;
      _pos := _pos + 1;
    end loop;
    _pipeline := null;
  end loop;

  for _f in select * from jsonb_array_elements(coalesce(_model->'fields', '[]'::jsonb)) loop
    insert into public.custom_fields (account_id, entity, key, label, type, options, help, position)
    values (_account, _f->>'entity', _f->>'key', left(_f->>'label', 80), _f->>'type',
            coalesce(_f->'options', '[]'::jsonb), _f->>'help',
            coalesce((select max(position) + 1 from public.custom_fields where account_id = _account and entity = _f->>'entity'), 0))
    on conflict (account_id, entity, key) do nothing;
    get diagnostics _n = row_count;
    _out := jsonb_set(_out, '{fields}', to_jsonb((_out->>'fields')::int + _n));
  end loop;

  for _q in select * from jsonb_array_elements(coalesce(_model->'macros', '[]'::jsonb)) loop
    insert into public.quick_replies (account_id, shortcut, title, body, is_shared, created_by)
    values (_account, _q->>'shortcut', left(_q->>'title', 80), left(_q->>'body', 4000), true, auth.uid())
    on conflict (account_id, shortcut) do nothing;
    get diagnostics _n = row_count;
    _out := jsonb_set(_out, '{macros}', to_jsonb((_out->>'macros')::int + _n));
  end loop;

  for _c in select * from jsonb_array_elements(coalesce(_model->'cadences', '[]'::jsonb)) loop
    if not exists (select 1 from public.automations where account_id = _account and template_key = _c->>'template_key') then
      insert into public.automations (account_id, name, description, kind, status, trigger, graph, template_key, created_by)
      values (_account, left(_c->>'name', 120), _c->>'description', 'sequence', 'draft',
              coalesce(_c->'trigger', '{"type":"manual"}'::jsonb), coalesce(_c->'graph', '{"nodes": {}, "start": null}'::jsonb), _c->>'template_key', auth.uid());
      _out := jsonb_set(_out, '{cadences}', to_jsonb((_out->>'cadences')::int + 1));
    end if;
  end loop;

  -- Áreas de outras frentes: só o jsonb do modelo, lido por elas depois.
  if _model ? 'agents' then
    insert into public.account_templates (account_id, area, template_key, payload, applied_by)
    values (_account, 'agents', _key, _model->'agents', auth.uid())
    on conflict (account_id, area) do update set template_key = excluded.template_key, payload = excluded.payload,
      applied_by = excluded.applied_by, applied_at = now();
  end if;
  if _model ? 'qa_form' then
    insert into public.account_templates (account_id, area, template_key, payload, applied_by)
    values (_account, 'qa_form', _key, _model->'qa_form', auth.uid())
    on conflict (account_id, area) do update set template_key = excluded.template_key, payload = excluded.payload,
      applied_by = excluded.applied_by, applied_at = now();
  end if;
  insert into public.account_templates (account_id, area, template_key, payload, applied_by)
  values (_account, 'segment', _key, jsonb_build_object('result', _out, 'version', coalesce(_model->>'version', '1')), auth.uid())
  on conflict (account_id, area) do update set template_key = excluded.template_key, payload = excluded.payload,
    applied_by = excluded.applied_by, applied_at = now();

  perform public.audit(_account, 'segment_template.applied', 'account', _account, jsonb_build_object('template', _key, 'result', _out));
  return _out;
end $$;
revoke all on function public.apply_segment_template(uuid, text, jsonb) from public, anon;
grant execute on function public.apply_segment_template(uuid, text, jsonb) to authenticated, service_role;

-- ───────────────────────── indicadores do gestor (histórico por semana) ─────────────────────────
-- TMA, TME, resolução no primeiro contato, abandono, CSAT e NPS por semana, agrupados por equipe
-- (fila da ligação / equipe do chamado) ou por atendente. NPS não tem equipe: sai no grupo "geral".
create or replace function public.gestao_trends(_account uuid, _from date, _to date, _group text default 'team')
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  _tz text; _s timestamptz; _e timestamptz; _out jsonb;
begin
  if auth.role() <> 'service_role' and not public.is_manager(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _group not in ('team','agent') or _to < _from or _to - _from > 400 then
    raise exception 'invalid params' using errcode = '22023';
  end if;
  select coalesce(nullif(timezone, ''), 'America/Sao_Paulo') into _tz from public.accounts where id = _account;
  _s := _from::timestamp at time zone _tz;
  _e := (_to + 1)::timestamp at time zone _tz;

  with calls_in as (
    select c.*, date_trunc('week', c.started_at at time zone _tz)::date wk,
           case when _group = 'team' then coalesce(q.name, 'Sem fila') else coalesce(c.user_id::text, 'sem_dono') end gk,
           case when _group = 'team' then coalesce(q.name, 'Sem fila') else coalesce(pr.full_name, 'Sem atendente') end gl
      from public.calls c
      left join public.call_queues q on q.id = c.queue_id
      left join public.profiles pr on pr.id = c.user_id
     where c.account_id = _account and c.direction = 'inbound' and c.voice_agent_id is null
       and c.started_at >= _s and c.started_at < _e
  ),
  voice as (
    select wk, gk, gl,
           count(*) inbound,
           count(*) filter (where answered_at is not null) answered,
           count(*) filter (where answered_at is null and status in ('missed','no_answer','canceled')) abandoned,
           round(avg(extract(epoch from answered_at - started_at)) filter (where answered_at is not null)) tme_seconds,
           round(avg(coalesce(billseconds, duration_seconds)) filter (where answered_at is not null)) tma_seconds,
           count(*) filter (where answered_at is not null and contact_id is not null and not exists (
             select 1 from public.calls c2 where c2.contact_id = calls_in.contact_id and c2.direction = 'inbound'
                and c2.started_at > calls_in.started_at and c2.started_at <= calls_in.started_at + interval '7 days')) fcr_ok,
           count(*) filter (where answered_at is not null and contact_id is not null) fcr_base
      from calls_in group by 1, 2, 3
  ),
  tk as (
    select t.*, date_trunc('week', t.created_at at time zone _tz)::date wk,
           case when _group = 'team' then coalesce(nullif(t.team, ''), 'Sem equipe') else coalesce(t.owner_user_id::text, 'sem_dono') end gk,
           case when _group = 'team' then coalesce(nullif(t.team, ''), 'Sem equipe') else coalesce(pr.full_name, 'Sem atendente') end gl
      from public.tickets t
      left join public.profiles pr on pr.id = t.owner_user_id
     where t.account_id = _account and t.created_at >= _s and t.created_at < _e
  ),
  tickets as (
    select wk, gk, gl,
           count(*) created,
           count(*) filter (where resolved_at is not null) resolved,
           round(avg(extract(epoch from first_response_at - created_at)) filter (where first_response_at is not null)) frt_seconds,
           round(avg(extract(epoch from resolved_at - created_at)) filter (where resolved_at is not null)) resolution_seconds,
           count(*) filter (where resolved_at is not null and not exists (
             select 1 from public.ticket_events e where e.ticket_id = tk.id and e.kind = 'status'
                and e.meta->>'from' in ('resolved','closed') and e.meta->>'to' in ('open','pending','waiting_customer'))) fcr_ok,
           round(avg(csat_score)::numeric, 2) csat_avg,
           count(csat_score) csat_n
      from tk group by 1, 2, 3
  ),
  nps as (
    select date_trunc('week', r.answered_at at time zone _tz)::date wk, 'geral'::text gk, 'Geral'::text gl,
           count(*) n,
           count(*) filter (where r.score >= 9) promoters,
           count(*) filter (where r.score <= 6) detractors
      from public.nps_responses r
     where r.account_id = _account and r.answered_at >= _s and r.answered_at < _e
     group by 1
  ),
  keys as (
    select wk, gk, gl from voice union select wk, gk, gl from tickets union select wk, gk, gl from nps
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'week', k.wk, 'group_key', k.gk, 'group_label', k.gl,
           'voice', case when v.wk is null then null else jsonb_build_object(
              'inbound', v.inbound, 'answered', v.answered, 'abandoned', v.abandoned,
              'tme_seconds', v.tme_seconds, 'tma_seconds', v.tma_seconds,
              'fcr_ok', v.fcr_ok, 'fcr_base', v.fcr_base) end,
           'tickets', case when t.wk is null then null else jsonb_build_object(
              'created', t.created, 'resolved', t.resolved, 'frt_seconds', t.frt_seconds,
              'resolution_seconds', t.resolution_seconds, 'fcr_ok', t.fcr_ok,
              'csat_avg', t.csat_avg, 'csat_n', t.csat_n) end,
           'nps', case when n.wk is null then null else jsonb_build_object(
              'n', n.n, 'promoters', n.promoters, 'detractors', n.detractors) end
         ) order by k.wk, k.gl), '[]'::jsonb)
    into _out
    from keys k
    left join voice v on v.wk = k.wk and v.gk = k.gk
    left join tickets t on t.wk = k.wk and t.gk = k.gk
    left join nps n on n.wk = k.wk and n.gk = k.gk;
  return jsonb_build_object('timezone', _tz, 'group', _group, 'rows', _out);
end $$;
revoke all on function public.gestao_trends(uuid, date, date, text) from public, anon;
grant execute on function public.gestao_trends(uuid, date, date, text) to authenticated, service_role;
