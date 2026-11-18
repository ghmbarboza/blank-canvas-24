-- Equipe de agentes de IA (plano v2: P3, P10, P11, §3-bis e "Pergunte ao Nexus").
-- Aditiva e idempotente. O agente do SAC que vivia em accounts.settings.ai_agent vira o primeiro
-- agente do registro (source = 'legacy_sac'), em rascunho: o caminho antigo continua respondendo
-- enquanto nenhum agente da equipe estiver ativo.

-- ───────────────────────── registro de agentes ─────────────────────────
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  role text not null check (role in ('reception','sdr','sac','collection','scheduling','post_sale','supervisor','custom')),
  template_key text,
  persona text not null default '' check (length(persona) <= 400),
  tone text not null default 'cordial, direto e em português do Brasil' check (length(tone) <= 300),
  goal text not null default '' check (length(goal) <= 1000),
  instructions text not null default '' check (length(instructions) <= 12000),
  handoff_message text not null default 'Vou chamar alguém da equipe para te ajudar com isso. Já já te respondem por aqui.'
    check (length(handoff_message) <= 600),
  -- plataformas atendidas (whatsapp, instagram, email, webchat...); vazio = todas
  channels text[] not null default '{}'::text[],
  voice_agent_id uuid references public.voice_agents(id) on delete set null,
  voice_id text,
  -- ritmo de gente (§3-bis): digitando, atraso, partes curtas, tom espelhado, "é robô?", áudio
  style jsonb not null default '{}'::jsonb,
  -- agenda, limites, formulário conversacional, pesquisa, prazo do humano
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  status_reason text,
  is_entry boolean not null default false,
  priority int not null default 100,
  version int not null default 1,
  tools_changed_at timestamptz,
  source text not null default 'template' check (source in ('template','legacy_sac','conversation','manual')),
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_agents_account on public.ai_agents (account_id, status);
create unique index if not exists ai_agents_entry_uq on public.ai_agents (account_id) where is_entry;
create unique index if not exists ai_agents_legacy_uq on public.ai_agents (account_id) where source = 'legacy_sac';

-- ferramentas ligadas por agente (internas e ações da Composio)
create table if not exists public.agent_tools (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  kind text not null check (kind in ('internal','composio')),
  slug text not null check (length(slug) between 1 and 120),
  enabled boolean not null default true,
  -- composio: toolkit, nome, descrição e esquema de entrada guardados para não buscar a cada turno
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_id, kind, slug)
);
create index if not exists agent_tools_agent on public.agent_tools (agent_id);

-- cada chamada de ferramenta, real ou da avaliação (dry_run)
create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  run_id uuid references public.ai_agent_runs(id) on delete set null,
  eval_run_id uuid,
  kind text not null check (kind in ('internal','composio','read')),
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  result jsonb,
  ok boolean not null default false,
  error text,
  dry_run boolean not null default false,
  latency_ms int,
  external_log_id text,
  created_at timestamptz not null default now()
);
create index if not exists agent_tool_calls_account on public.agent_tool_calls (account_id, created_at desc);
create index if not exists agent_tool_calls_conversation on public.agent_tool_calls (conversation_id, created_at desc);

-- passagem de bastão: agente → agente ou agente → humano (com dono e prazo)
create table if not exists public.agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_agent_id uuid references public.ai_agents(id) on delete set null,
  to_agent_id uuid references public.ai_agents(id) on delete set null,
  to_user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('agent','human')),
  reason text not null default '' check (length(reason) <= 500),
  summary text not null default '' check (length(summary) <= 2000),
  due_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_handoffs_conversation on public.agent_handoffs (conversation_id, created_at desc);
create index if not exists agent_handoffs_open on public.agent_handoffs (account_id, due_at) where kind = 'human' and answered_at is null;

-- estado do agente na conversa: quem está atendendo, saudação feita, campos coletados, pesquisa
create table if not exists public.agent_conversation_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  greeted_at timestamptz,
  collected jsonb not null default '{}'::jsonb,
  survey jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- suíte de avaliação por agente
create table if not exists public.agent_evals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  kind text not null default 'knowledge'
    check (kind in ('knowledge','conversation','tool_failure','out_of_scope','jailbreak','handoff','custom')),
  question text not null check (length(trim(question)) between 1 and 2000),
  history jsonb not null default '[]'::jsonb,
  expected text not null default '' check (length(expected) <= 2000),
  must_handoff boolean not null default false,
  fail_tool text,
  source text not null default 'manual' check (source in ('kb','conversation','template','manual')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_evals_agent on public.agent_evals (agent_id);

create table if not exists public.agent_eval_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  agent_version int not null,
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  total int not null default 0,
  passed int not null default 0,
  pass_rate real,
  estimated_cost_usd numeric(10,4),
  cost_usd numeric(10,4),
  model text,
  results jsonb not null default '[]'::jsonb,
  error text,
  started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_eval_runs_agent on public.agent_eval_runs (agent_id, created_at desc);

-- pesquisa conversacional (CSAT/NPS extraído da resposta natural)
create table if not exists public.agent_survey_answers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_id uuid references public.ai_agents(id) on delete set null,
  kind text not null check (kind in ('csat','nps')),
  score int not null check (score between 0 and 10),
  comment text check (length(comment) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists agent_survey_answers_account on public.agent_survey_answers (account_id, created_at desc);

-- supervisor: conversa travada, cliente irritado, promessa indevida, IA calada sem dono
create table if not exists public.supervisor_flags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('stuck','angry','bad_promise','silent_no_owner')),
  detail text not null default '' check (length(detail) <= 600),
  evidence text check (length(evidence) <= 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create unique index if not exists supervisor_flags_open_uq on public.supervisor_flags (conversation_id, kind) where status = 'open';
create index if not exists supervisor_flags_account on public.supervisor_flags (account_id, status, created_at desc);

-- Composio: a chave é do cliente e mora no Vault (integration/composio_api_key); aqui só o estado
create table if not exists public.composio_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  user_id text not null,
  session_id text,
  webhook_subscription_id text,
  status text not null default 'pending' check (status in ('pending','connected','error')),
  last_error text,
  tested_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.composio_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  toolkit text not null check (toolkit ~ '^[a-z0-9_]{2,60}$'),
  connected_account_id text,
  status text not null default 'pending' check (status in ('pending','active','failed','expired','disabled')),
  alias text,
  channel_id uuid references public.channels(id) on delete set null,
  trigger_id text,
  connected_by uuid references auth.users(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, toolkit)
);

-- Pergunte ao Nexus: histórico das perguntas do gestor
create table if not exists public.nexus_questions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (length(question) between 1 and 2000),
  answer text,
  used jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nexus_questions_user on public.nexus_questions (account_id, user_id, created_at desc);

alter table public.ai_agent_runs add column if not exists agent_id uuid references public.ai_agents(id) on delete set null;

-- ───────────────────────── gatilhos: versão e portão de ativação ─────────────────────────
-- Mudou o que o agente diz ou faz → nova versão. Agente ativo que muda pausa até passar de novo.
-- Só liga com a última avaliação DESTA versão em 90% ou mais (o supervisor não fala com cliente).
create or replace function public.tg_ai_agents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _rate real;
begin
  if tg_op = 'UPDATE' then
    if (new.persona, new.tone, new.goal, new.instructions, new.handoff_message, new.role, new.settings, new.channels)
         is distinct from (old.persona, old.tone, old.goal, old.instructions, old.handoff_message, old.role, old.settings, old.channels)
       or new.tools_changed_at is distinct from old.tools_changed_at then
      new.version := old.version + 1;
      if old.status = 'active' and new.status = 'active' and new.role <> 'supervisor' then
        new.status := 'paused';
        new.status_reason := 'Mudou a configuração: rode a avaliação de novo para ligar.';
      end if;
    else
      new.version := old.version;
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    if new.role <> 'supervisor' then
      select r.pass_rate into _rate from public.agent_eval_runs r
       where r.agent_id = new.id and r.agent_version = new.version and r.status = 'done'
       order by coalesce(r.finished_at, r.created_at) desc limit 1;
      if _rate is null or round(_rate::numeric, 4) < 0.9 then
        raise exception 'O agente precisa passar na avaliação com 90%% ou mais antes de ligar.'
          using errcode = 'P0001';
      end if;
    end if;
    new.activated_at := now();
    new.activated_by := auth.uid();
    new.status_reason := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ai_agents_guard on public.ai_agents;
create trigger ai_agents_guard before insert or update on public.ai_agents
  for each row execute function public.tg_ai_agents_guard();

create or replace function public.tg_agent_tools_bump() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_agents set tools_changed_at = clock_timestamp()
   where id = coalesce(new.agent_id, old.agent_id);
  return null;
end $$;
drop trigger if exists agent_tools_bump on public.agent_tools;
create trigger agent_tools_bump after insert or update or delete on public.agent_tools
  for each row execute function public.tg_agent_tools_bump();

create or replace function public.tg_agent_tools_same_account() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.ai_agents a where a.id = new.agent_id and a.account_id = new.account_id) then
    raise exception 'agente de outra conta' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists agent_tools_same_account on public.agent_tools;
create trigger agent_tools_same_account before insert or update on public.agent_tools
  for each row execute function public.tg_agent_tools_same_account();
drop trigger if exists agent_evals_same_account on public.agent_evals;
create trigger agent_evals_same_account before insert or update on public.agent_evals
  for each row execute function public.tg_agent_tools_same_account();

-- ───────────────────────── RLS ─────────────────────────
alter table public.ai_agents enable row level security;
drop policy if exists ai_agents_select on public.ai_agents;
create policy ai_agents_select on public.ai_agents for select using (public.is_member(account_id));
drop policy if exists ai_agents_insert on public.ai_agents;
create policy ai_agents_insert on public.ai_agents for insert with check (public.is_manager(account_id));
drop policy if exists ai_agents_update on public.ai_agents;
create policy ai_agents_update on public.ai_agents for update using (public.is_manager(account_id)) with check (public.is_manager(account_id));
drop policy if exists ai_agents_delete on public.ai_agents;
create policy ai_agents_delete on public.ai_agents for delete using (public.is_manager(account_id));

alter table public.agent_tools enable row level security;
drop policy if exists agent_tools_select on public.agent_tools;
create policy agent_tools_select on public.agent_tools for select using (public.is_member(account_id));
drop policy if exists agent_tools_write on public.agent_tools;
create policy agent_tools_write on public.agent_tools for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

alter table public.agent_evals enable row level security;
drop policy if exists agent_evals_select on public.agent_evals;
create policy agent_evals_select on public.agent_evals for select using (public.is_member(account_id));
drop policy if exists agent_evals_write on public.agent_evals;
create policy agent_evals_write on public.agent_evals for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- só leitura para membros; a escrita é do servidor (service role)
alter table public.agent_tool_calls enable row level security;
drop policy if exists agent_tool_calls_select on public.agent_tool_calls;
create policy agent_tool_calls_select on public.agent_tool_calls for select using (public.is_member(account_id));
alter table public.agent_handoffs enable row level security;
drop policy if exists agent_handoffs_select on public.agent_handoffs;
create policy agent_handoffs_select on public.agent_handoffs for select using (public.is_member(account_id));
alter table public.agent_conversation_state enable row level security;
drop policy if exists agent_conversation_state_select on public.agent_conversation_state;
create policy agent_conversation_state_select on public.agent_conversation_state for select using (public.is_member(account_id));
alter table public.agent_eval_runs enable row level security;
drop policy if exists agent_eval_runs_select on public.agent_eval_runs;
create policy agent_eval_runs_select on public.agent_eval_runs for select using (public.is_member(account_id));
alter table public.agent_survey_answers enable row level security;
drop policy if exists agent_survey_answers_select on public.agent_survey_answers;
create policy agent_survey_answers_select on public.agent_survey_answers for select using (public.is_member(account_id));
alter table public.composio_settings enable row level security;
drop policy if exists composio_settings_select on public.composio_settings;
create policy composio_settings_select on public.composio_settings for select using (public.is_member(account_id));
alter table public.composio_connections enable row level security;
drop policy if exists composio_connections_select on public.composio_connections;
create policy composio_connections_select on public.composio_connections for select using (public.is_member(account_id));

alter table public.supervisor_flags enable row level security;
drop policy if exists supervisor_flags_select on public.supervisor_flags;
create policy supervisor_flags_select on public.supervisor_flags for select using (public.is_member(account_id));
drop policy if exists supervisor_flags_update on public.supervisor_flags;
create policy supervisor_flags_update on public.supervisor_flags for update using (public.is_manager(account_id)) with check (public.is_manager(account_id));

alter table public.nexus_questions enable row level security;
drop policy if exists nexus_questions_select on public.nexus_questions;
create policy nexus_questions_select on public.nexus_questions for select
  using (public.is_member(account_id) and (user_id = auth.uid() or public.is_manager(account_id)));

-- ───────────────────────── o agente do SAC antigo vira agente do registro ─────────────────────────
create or replace function public.agents_import_legacy(_account uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare _s jsonb; _id uuid; _sched boolean;
begin
  if auth.role() <> 'service_role' and not public.is_manager(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into _id from public.ai_agents where account_id = _account and source = 'legacy_sac';
  if _id is not null then return _id; end if;
  select coalesce(settings -> 'ai_agent', '{}'::jsonb) into _s from public.accounts where id = _account;
  if _s is null then return null; end if;
  _sched := coalesce((_s ->> 'scheduling_enabled')::boolean, false);
  insert into public.ai_agents (account_id, name, role, template_key, persona, tone, instructions, handoff_message,
                                settings, status, is_entry, priority, source, status_reason)
  values (
    _account, 'Atendimento (SAC)', 'sac', 'sac',
    left(coalesce(nullif(_s ->> 'persona', ''), 'Assistente da empresa'), 400),
    left(coalesce(nullif(_s ->> 'tone', ''), 'cordial, direto e em português do Brasil'), 300),
    left(coalesce(_s ->> 'rules', ''), 12000),
    left(coalesce(nullif(_s ->> 'handoff_message', ''), 'Vou chamar alguém da equipe para te ajudar com isso. Já já te respondem por aqui.'), 600),
    jsonb_strip_nulls(jsonb_build_object(
      'scheduling_enabled', _sched,
      'booking_slug', nullif(_s ->> 'booking_slug', ''),
      'max_replies_per_conversation', coalesce((_s ->> 'max_replies_per_conversation')::int, 12),
      'business_hours_only', coalesce((_s ->> 'business_hours_only')::boolean, false),
      'debounce_seconds', coalesce((_s ->> 'debounce_seconds')::int, 20),
      'human_sla_minutes', 15
    )),
    'draft', true, 50, 'legacy_sac',
    case when coalesce((_s ->> 'enabled')::boolean, false)
         then 'O agente antigo segue respondendo. Rode a avaliação para a equipe assumir.' end
  )
  returning id into _id;
  insert into public.agent_tools (account_id, agent_id, kind, slug)
  select _account, _id, 'internal', t
    from unnest(array['kb_search','open_ticket','identify_contact','notify_manager']
                || case when _sched then array['availability','book','reschedule'] else array[]::text[] end) t
  on conflict do nothing;
  return _id;
end $$;
revoke all on function public.agents_import_legacy(uuid) from public, anon;
grant execute on function public.agents_import_legacy(uuid) to authenticated, service_role;

-- contas que já tinham o agente do SAC configurado
do $$
declare _a uuid;
begin
  for _a in select id from public.accounts where settings ? 'ai_agent' loop
    perform public.agents_import_legacy(_a);
  end loop;
end $$;

-- ───────────────────────── supervisor: candidatos determinísticos ─────────────────────────
-- IA calada sem dono: a IA mexeu na conversa (passou, pulou ou errou), ninguém é dono e o cliente
-- espera há mais de _silent_minutes. Travada: passagem para humano com prazo vencido sem resposta.
create or replace function public.agents_supervisor_candidates(_account uuid, _silent_minutes int default 10)
returns table (conversation_id uuid, kind text, detail text, assignee uuid, waiting_since timestamptz)
language sql stable security definer set search_path = public as $$
  with last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.direction, m.created_at
      from public.messages m
     where m.account_id = _account and not m.is_private
       and m.created_at > now() - interval '7 days'
     order by m.conversation_id, m.created_at desc
  ),
  touched as (
    select distinct r.conversation_id from public.ai_agent_runs r
     where r.account_id = _account and r.created_at > now() - interval '7 days'
       and r.status in ('handoff','skipped','error')
  )
  select c.id, 'silent_no_owner'::text,
         'O cliente espera há ' || round(extract(epoch from now() - lm.created_at) / 60) || ' min e a conversa não tem dono.',
         c.assignee_user_id, lm.created_at
    from public.conversations c
    join last_msg lm on lm.conversation_id = c.id
   where c.account_id = _account and c.status in ('open','pending')
     and lm.direction = 'in' and lm.created_at < now() - make_interval(mins => greatest(1, _silent_minutes))
     and c.assignee_user_id is null
     and (c.ai_handoff_at is not null or c.id in (select t.conversation_id from touched t))
  union all
  select h.conversation_id, 'stuck'::text,
         'Passada para a equipe às ' || to_char(h.created_at at time zone 'America/Sao_Paulo', 'HH24:MI') || ' e sem resposta no prazo.',
         h.to_user_id, h.created_at
    from public.agent_handoffs h
    join public.conversations c on c.id = h.conversation_id and c.status in ('open','pending')
   where h.account_id = _account and h.kind = 'human' and h.answered_at is null and h.due_at < now()
     and not exists (select 1 from public.messages m where m.conversation_id = h.conversation_id
                       and m.direction = 'out' and m.sender_type = 'user' and m.created_at > h.created_at);
$$;
revoke all on function public.agents_supervisor_candidates(uuid, int) from public, anon, authenticated;
grant execute on function public.agents_supervisor_candidates(uuid, int) to service_role;

-- passagem respondida: a primeira mensagem humana depois dela fecha o prazo
create or replace function public.agents_mark_answered(_account uuid) returns int
language sql security definer set search_path = public as $$
  with upd as (
    update public.agent_handoffs h set answered_at = (
      select min(m.created_at) from public.messages m
       where m.conversation_id = h.conversation_id and m.direction = 'out'
         and m.sender_type = 'user' and m.created_at > h.created_at)
     where h.account_id = _account and h.kind = 'human' and h.answered_at is null
       and exists (select 1 from public.messages m where m.conversation_id = h.conversation_id
                     and m.direction = 'out' and m.sender_type = 'user' and m.created_at > h.created_at)
    returning 1)
  select count(*)::int from upd;
$$;
revoke all on function public.agents_mark_answered(uuid) from public, anon, authenticated;
grant execute on function public.agents_mark_answered(uuid) to service_role;

-- painel da equipe: números por agente nos últimos _days dias (o card de pessoa mostra estes)
create or replace function public.agents_overview(_account uuid, _days int default 7)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _since timestamptz := now() - make_interval(days => greatest(1, least(_days, 90)));
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'since', _since,
    'agents', coalesce((select jsonb_object_agg(a.id, jsonb_build_object(
        'replied', (select count(*) from public.ai_agent_runs r where r.agent_id = a.id and r.status = 'replied' and r.created_at >= _since),
        'handoff', (select count(*) from public.ai_agent_runs r where r.agent_id = a.id and r.status = 'handoff' and r.created_at >= _since),
        'tools', (select count(*) from public.agent_tool_calls t where t.agent_id = a.id and not t.dry_run and t.created_at >= _since),
        'last_eval', (select jsonb_build_object('pass_rate', e.pass_rate, 'version', e.agent_version, 'at', e.created_at, 'status', e.status)
                        from public.agent_eval_runs e where e.agent_id = a.id order by e.created_at desc limit 1)
      )) from public.ai_agents a where a.account_id = _account), '{}'::jsonb),
    'silent_open', (select count(*) from public.supervisor_flags f where f.account_id = _account and f.status = 'open' and f.kind = 'silent_no_owner'),
    'flags_open', (select count(*) from public.supervisor_flags f where f.account_id = _account and f.status = 'open'),
    'handoffs_human', (select count(*) from public.agent_handoffs h where h.account_id = _account and h.kind = 'human' and h.created_at >= _since),
    'handoffs_with_owner', (select count(*) from public.agent_handoffs h where h.account_id = _account and h.kind = 'human' and h.created_at >= _since and h.to_user_id is not null)
  );
end $$;
grant execute on function public.agents_overview(uuid, int) to authenticated;
