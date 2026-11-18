-- Automação omnichannel e cadências de vendas (M4).
-- automations: o desenho (gatilho + grafo de passos + regras de saída + guardas).
-- automation_runs: cada contato inscrito anda pelo grafo; o executor é o job "automation.step".
-- automation_logs: o que aconteceu em cada passo (auditoria e métricas).

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  kind text not null default 'journey' check (kind in ('journey','sequence','rule')),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  trigger jsonb not null default '{"type":"manual"}'::jsonb,
  graph jsonb not null default '{"start":null,"nodes":{}}'::jsonb,
  exit_rules jsonb not null default '{"on_reply":true,"on_meeting":true,"on_customer":true,"on_unsubscribe":true,"on_deal_lost":false}'::jsonb,
  guards jsonb not null default '{"weekly_cap":3,"business_hours":{"start":"08:00","end":"20:00","days":[1,2,3,4,5]},"respect_consent":true}'::jsonb,
  reentry text not null default 'never' check (reentry in ('never','after_exit','always')),
  version int not null default 1,
  template_key text,
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_account on public.automations (account_id, status);
drop trigger if exists automations_touch on public.automations;
create trigger automations_touch before update on public.automations for each row execute function public.touch_updated_at();
alter table public.automations enable row level security;
drop policy if exists automations_select on public.automations;
create policy automations_select on public.automations for select using (public.is_member(account_id));
drop policy if exists automations_write on public.automations;
create policy automations_write on public.automations for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  status text not null default 'running' check (status in ('running','waiting','paused','done','exited','failed')),
  current_node text,
  step_seq int not null default 0,
  next_at timestamptz,
  enrolled_at timestamptz not null default now(),
  finished_at timestamptz,
  exit_reason text,
  context jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  enrolled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Um contato só anda uma vez de cada vez na mesma automação.
create unique index if not exists automation_runs_active on public.automation_runs (automation_id, contact_id)
  where status in ('running','waiting','paused');
create index if not exists automation_runs_contact on public.automation_runs (contact_id, status);
create index if not exists automation_runs_automation on public.automation_runs (automation_id, status);
drop trigger if exists automation_runs_touch on public.automation_runs;
create trigger automation_runs_touch before update on public.automation_runs for each row execute function public.touch_updated_at();
alter table public.automation_runs enable row level security;
-- A subconsulta em contacts passa pela RLS do contato: vendedor só vê inscrições de quem ele vê.
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select using (
  public.is_member(account_id) and exists (select 1 from public.contacts c where c.id = contact_id)
);
drop policy if exists automation_runs_insert on public.automation_runs;
create policy automation_runs_insert on public.automation_runs for insert with check (
  public.is_member(account_id)
  and exists (select 1 from public.contacts c where c.id = contact_id and c.account_id = automation_runs.account_id)
  and exists (select 1 from public.automations a where a.id = automation_id and a.account_id = automation_runs.account_id)
);
drop policy if exists automation_runs_update on public.automation_runs;
create policy automation_runs_update on public.automation_runs for update using (
  public.is_member(account_id) and exists (select 1 from public.contacts c where c.id = contact_id)
) with check (public.is_member(account_id));

create table if not exists public.automation_logs (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  run_id uuid references public.automation_runs(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  node_id text,
  node_type text,
  status text not null check (status in ('ok','skipped','failed','deferred','exited','entered')),
  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_logs_automation on public.automation_logs (automation_id, created_at desc);
create index if not exists automation_logs_run on public.automation_logs (run_id, created_at);
alter table public.automation_logs enable row level security;
drop policy if exists automation_logs_select on public.automation_logs;
create policy automation_logs_select on public.automation_logs for select using (
  public.is_member(account_id) and (contact_id is null or exists (select 1 from public.contacts c where c.id = contact_id))
);

-- Números da automação para a lista (ativos, concluídos, saídas, conversões) sem trazer as linhas.
create or replace function public.automation_stats(_account uuid)
returns table (automation_id uuid, active int, done int, exited int, total int, converted int)
language sql stable security invoker set search_path = public as $$
  select r.automation_id,
         count(*) filter (where r.status in ('running','waiting','paused'))::int,
         count(*) filter (where r.status = 'done')::int,
         count(*) filter (where r.status = 'exited')::int,
         count(*)::int,
         count(*) filter (where r.exit_reason in ('meeting','customer','replied') or (r.context->>'converted') = 'true')::int
    from public.automation_runs r
   where r.account_id = _account
   group by r.automation_id;
$$;
grant execute on function public.automation_stats(uuid) to authenticated;

-- Linha do tempo: entrada e saída de automações aparecem na ficha do contato.
create or replace function public.timeline_part_automations(_contact uuid)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  select 'activity'::text, r.id, r.enrolled_at, 'Entrou na automação: ' || a.name,
         case r.status when 'exited' then 'Saiu: ' || coalesce(r.exit_reason, '—')
                       when 'done' then 'Concluiu todos os passos' else null end,
         jsonb_build_object('type', 'system', 'automation_id', a.id, 'status', r.status)
    from public.automation_runs r join public.automations a on a.id = r.automation_id
   where r.contact_id = _contact;
$$;
grant execute on function public.timeline_part_automations(uuid) to authenticated;
