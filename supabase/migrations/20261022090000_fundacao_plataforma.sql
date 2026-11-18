-- Fundação da plataforma completa (Fase 1).
-- Fila de jobs, eventos de domínio, auditoria, notificações, consumo, API pública e webhooks de saída,
-- empresas, campos personalizados, segmentos, consentimento e supressões, e a linha do tempo 360.

-- ───────────────────────── provedores e canais novos ─────────────────────────
alter table public.account_integrations drop constraint if exists account_integrations_provider_check;
alter table public.account_integrations add constraint account_integrations_provider_check check (provider = any (array[
  'evolution','zernio','meta','twilio','openai','anthropic','google',
  'resend','livekit','deepgram','zadarma','elevenlabs','asaas','microsoft','meta_leads'
]));

alter table public.channels drop constraint if exists channels_provider_check;
alter table public.channels add constraint channels_provider_check check (provider = any (array[
  'whatsapp_cloud','evolution','zernio','twilio_sms','webchat','email','zadarma'
]));
alter table public.channels drop constraint if exists channels_platform_check;
alter table public.channels add constraint channels_platform_check check (platform = any (array[
  'whatsapp','instagram','facebook','linkedin','tiktok','telegram','x','threads','bluesky','reddit',
  'youtube','google_business','sms','webchat','email','voice'
]));

alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check check (type = any (array[
  'note','call','task','email','meeting','stage_change','ai','whatsapp','system'
]));

-- ───────────────────────── fila de jobs ─────────────────────────
-- Tudo que é assíncrono (automação, campanha, lembrete, webhook de saída) passa por aqui.
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9_.]{2,60}$'),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','running','done','failed','dead','canceled')),
  attempts int not null default 0,
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  locked_until timestamptz,
  dedupe_key text,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_due on public.jobs (run_at) where status = 'queued';
create unique index if not exists jobs_dedupe on public.jobs (dedupe_key) where dedupe_key is not null and status in ('queued','running');
create index if not exists jobs_account on public.jobs (account_id, created_at desc);
alter table public.jobs enable row level security;
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs for select using (account_id is not null and public.is_manager(account_id));

-- Pega até _limit jobs vencidos com trava (skip locked): dois ticks simultâneos nunca pegam o mesmo job.
create or replace function public.claim_jobs(_limit int default 20, _lease_seconds int default 120)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with due as (
    select j.id from public.jobs j
    where (j.status = 'queued' and j.run_at <= now())
       or (j.status = 'running' and j.locked_until < now())
    order by j.run_at
    limit greatest(1, least(_limit, 100))
    for update skip locked
  )
  update public.jobs j set status = 'running', attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => _lease_seconds)
  from due where j.id = due.id
  returning j.*;
end $$;
revoke all on function public.claim_jobs(int, int) from public, anon, authenticated;

-- Fecha o job: sucesso, nova tentativa com recuo exponencial, ou morto depois do limite.
create or replace function public.finish_job(_id uuid, _ok boolean, _error text default null, _result jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare _j public.jobs;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into _j from public.jobs where id = _id for update;
  if not found then return; end if;
  if _ok then
    update public.jobs set status = 'done', finished_at = now(), locked_until = null, result = _result, last_error = null where id = _id;
  elsif _j.attempts >= _j.max_attempts then
    update public.jobs set status = 'dead', finished_at = now(), locked_until = null, last_error = left(_error, 2000) where id = _id;
  else
    update public.jobs set status = 'queued', locked_until = null, last_error = left(_error, 2000),
           run_at = now() + make_interval(secs => least(3600, (30 * power(2, _j.attempts - 1))::int)) where id = _id;
  end if;
end $$;
revoke all on function public.finish_job(uuid, boolean, text, jsonb) from public, anon, authenticated;

create or replace function public.enqueue_job(_account uuid, _kind text, _payload jsonb, _run_at timestamptz default now(), _dedupe text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.role() <> 'service_role' and (_account is null or not public.is_member(_account)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.jobs (account_id, kind, payload, run_at, dedupe_key)
  values (_account, _kind, coalesce(_payload, '{}'::jsonb), coalesce(_run_at, now()), _dedupe)
  on conflict do nothing
  returning id into _id;
  return _id;
end $$;
revoke all on function public.enqueue_job(uuid, text, jsonb, timestamptz, text) from public, anon;
grant execute on function public.enqueue_job(uuid, text, jsonb, timestamptz, text) to authenticated;

-- ───────────────────────── eventos de domínio (outbox) ─────────────────────────
create table if not exists public.domain_events (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  type text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);
create index if not exists domain_events_pending on public.domain_events (id) where dispatched_at is null;
create index if not exists domain_events_account on public.domain_events (account_id, created_at desc);
alter table public.domain_events enable row level security;
drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_select on public.domain_events for select using (public.is_manager(account_id));

create or replace function public.emit_event(_account uuid, _type text, _entity text, _entity_id uuid, _payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.domain_events (account_id, type, entity, entity_id, payload)
  values (_account, _type, _entity, _entity_id, coalesce(_payload, '{}'::jsonb));
$$;
revoke all on function public.emit_event(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- Gatilhos que alimentam o outbox a partir das tabelas que já existem.
create or replace function public.tg_contact_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event(new.account_id, 'contact.created', 'contact', new.id, jsonb_build_object('source', new.source));
  elsif new.lifecycle is distinct from old.lifecycle then
    perform public.emit_event(new.account_id, 'contact.lifecycle_changed', 'contact', new.id,
      jsonb_build_object('from', old.lifecycle, 'to', new.lifecycle));
  elsif new.score is distinct from old.score and coalesce(new.score, 0) >= 60 and coalesce(old.score, 0) < 60 then
    perform public.emit_event(new.account_id, 'contact.became_hot', 'contact', new.id, jsonb_build_object('score', new.score));
  end if;
  return new;
end $$;
drop trigger if exists contacts_events on public.contacts;
create trigger contacts_events after insert or update of lifecycle, score on public.contacts
  for each row execute function public.tg_contact_events();

create or replace function public.tg_deal_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event(new.account_id, 'deal.created', 'deal', new.id, jsonb_build_object('contact_id', new.contact_id));
  elsif new.stage_id is distinct from old.stage_id then
    perform public.emit_event(new.account_id, 'deal.stage_changed', 'deal', new.id,
      jsonb_build_object('from', old.stage_id, 'to', new.stage_id, 'contact_id', new.contact_id));
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('won','lost') then
    perform public.emit_event(new.account_id, 'deal.' || new.status, 'deal', new.id,
      jsonb_build_object('contact_id', new.contact_id, 'value', new.value));
  end if;
  return new;
end $$;
drop trigger if exists deals_events on public.deals;
create trigger deals_events after insert or update of stage_id, status on public.deals
  for each row execute function public.tg_deal_events();

create or replace function public.tg_message_events() returns trigger language plpgsql security definer set search_path = public as $$
declare _contact uuid;
begin
  if new.direction = 'in' and not new.is_private then
    select contact_id into _contact from public.conversations where id = new.conversation_id;
    perform public.emit_event(new.account_id, 'message.received', 'conversation', new.conversation_id,
      jsonb_build_object('message_id', new.id, 'contact_id', _contact, 'type', new.type));
  end if;
  return new;
end $$;
drop trigger if exists messages_events on public.messages;
create trigger messages_events after insert on public.messages
  for each row execute function public.tg_message_events();

-- ───────────────────────── auditoria ─────────────────────────
create table if not exists public.audit_log (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_account on public.audit_log (account_id, created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using (public.has_role(account_id, array['owner','admin']::public.app_role[]));

create or replace function public.audit(_account uuid, _action text, _entity text, _entity_id uuid, _meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_log (account_id, actor_id, action, entity, entity_id, meta)
  values (_account, auth.uid(), left(_action, 80), left(_entity, 40), _entity_id, coalesce(_meta, '{}'::jsonb));
end $$;
revoke all on function public.audit(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.audit(uuid, text, text, uuid, jsonb) to authenticated;

-- ───────────────────────── notificações ─────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null check (length(title) between 1 and 200),
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = auth.uid() and public.is_member(account_id));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

create or replace function public.notify_user(_account uuid, _user uuid, _kind text, _title text, _body text default null, _link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships where account_id = _account and user_id = _user and is_active) then return; end if;
  insert into public.notifications (account_id, user_id, kind, title, body, link)
  values (_account, _user, left(_kind, 40), left(_title, 200), left(_body, 1000), left(_link, 500));
end $$;
revoke all on function public.notify_user(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.notify_user(uuid, uuid, text, text, text, text) to authenticated;

-- Notifica o dono quando um contato esquenta ou um negócio é atribuído a ele.
create or replace function public.tg_contact_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_user_id is not null and coalesce(new.score, 0) >= 60 and coalesce(old.score, 0) < 60 then
    perform public.notify_user(new.account_id, new.owner_user_id, 'lead_hot',
      'Lead quente: ' || coalesce(new.name, 'sem nome'), new.ai_next_step, '/contatos/' || new.id);
  end if;
  if new.owner_user_id is not null and new.owner_user_id is distinct from old.owner_user_id then
    perform public.notify_user(new.account_id, new.owner_user_id, 'contact_assigned',
      'Contato atribuído a você: ' || coalesce(new.name, 'sem nome'), null, '/contatos/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists contacts_notify on public.contacts;
create trigger contacts_notify after update of score, owner_user_id on public.contacts
  for each row execute function public.tg_contact_notify();

-- Realtime das notificações (o sino atualiza sozinho).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ───────────────────────── consumo (carteira de créditos) ─────────────────────────
create table if not exists public.usage_ledger (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('llm','voice_ai_min','phone_min','email','whatsapp_template','meeting_min','transcription_min','sms','other')),
  quantity numeric not null default 1,
  unit text not null default 'un',
  cost_usd numeric(12,6) not null default 0,
  ref_table text,
  ref_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_ledger_account on public.usage_ledger (account_id, created_at desc);
alter table public.usage_ledger enable row level security;
drop policy if exists usage_ledger_select on public.usage_ledger;
create policy usage_ledger_select on public.usage_ledger for select using (public.is_manager(account_id));

-- ───────────────────────── API pública e webhooks de saída ─────────────────────────
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['contacts:read','contacts:write','deals:read','deals:write']::text[],
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.api_keys enable row level security;
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys for select using (public.has_role(account_id, array['owner','admin']::public.app_role[]));
drop policy if exists api_keys_update on public.api_keys;
create policy api_keys_update on public.api_keys for update using (public.has_role(account_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner','admin']::public.app_role[]));

-- Cria a chave: devolve o texto uma única vez; no banco fica só o hash.
create or replace function public.create_api_key(_account uuid, _name text, _scopes text[] default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare _raw text; _id uuid;
begin
  if not public.has_role(_account, array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  _raw := 'nx_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (account_id, name, prefix, key_hash, scopes, created_by)
  values (_account, trim(_name), left(_raw, 10), encode(extensions.digest(_raw, 'sha256'), 'hex'),
          coalesce(_scopes, array['contacts:read','contacts:write','deals:read','deals:write']::text[]), auth.uid())
  returning id into _id;
  perform public.audit(_account, 'api_key.created', 'api_key', _id, jsonb_build_object('name', _name));
  return jsonb_build_object('id', _id, 'key', _raw);
end $$;
revoke all on function public.create_api_key(uuid, text, text[]) from public, anon;
grant execute on function public.create_api_key(uuid, text, text[]) to authenticated;

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  events text[] not null default array['contact.created','deal.won']::text[],
  is_active boolean not null default true,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.webhook_endpoints enable row level security;
drop policy if exists webhook_endpoints_all on public.webhook_endpoints;
create policy webhook_endpoints_all on public.webhook_endpoints for all
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner','admin']::public.app_role[]));

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_id bigint,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts int not null default 0,
  response_code int,
  response_body text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists webhook_deliveries_due on public.webhook_deliveries (next_attempt_at) where status = 'pending';
alter table public.webhook_deliveries enable row level security;
drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries for select
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]));

-- ───────────────────────── empresas ─────────────────────────
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  legal_name text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  domain text,
  industry text,
  size text check (size is null or size in ('1-10','11-50','51-200','201-500','501-1000','1000+')),
  phone text,
  email text,
  website text,
  address jsonb not null default '{}'::jsonb,
  owner_user_id uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists companies_cnpj on public.companies (account_id, cnpj) where cnpj is not null;
create index if not exists companies_account_name on public.companies (account_id, lower(name));
create index if not exists companies_domain on public.companies (account_id, lower(domain)) where domain is not null;
drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();
alter table public.companies enable row level security;
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select using (public.is_member(account_id));
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert with check (public.is_member(account_id));
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update
  using (public.is_member(account_id) and (not public.has_role(account_id, array['seller']::public.app_role[]) or owner_user_id is null or owner_user_id = auth.uid()))
  with check (public.is_member(account_id));
drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete using (public.is_manager(account_id));

alter table public.contacts add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.deals add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.deals add column if not exists custom jsonb not null default '{}'::jsonb;
create index if not exists contacts_company on public.contacts (company_id) where company_id is not null;
create index if not exists deals_company on public.deals (company_id) where company_id is not null;

-- Contato e negócio sempre na mesma conta da empresa.
create or replace function public.tg_company_same_account() returns trigger language plpgsql as $$
begin
  if new.company_id is not null and not exists (
    select 1 from public.companies c where c.id = new.company_id and c.account_id = new.account_id
  ) then
    raise exception 'empresa de outra conta' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists contacts_company_account on public.contacts;
create trigger contacts_company_account before insert or update of company_id on public.contacts
  for each row execute function public.tg_company_same_account();
drop trigger if exists deals_company_account on public.deals;
create trigger deals_company_account before insert or update of company_id on public.deals
  for each row execute function public.tg_company_same_account();

-- ───────────────────────── campos personalizados ─────────────────────────
create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  entity text not null check (entity in ('contact','company','deal','ticket')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(trim(label)) between 1 and 80),
  type text not null check (type in ('text','long_text','number','money','date','select','multiselect','boolean','url','email','phone')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  required_stage_id uuid references public.pipeline_stages(id) on delete set null,
  help text,
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, entity, key)
);
alter table public.custom_fields enable row level security;
drop policy if exists custom_fields_select on public.custom_fields;
create policy custom_fields_select on public.custom_fields for select using (public.is_member(account_id));
drop policy if exists custom_fields_write on public.custom_fields;
create policy custom_fields_write on public.custom_fields for all using (public.is_manager(account_id)) with check (public.is_manager(account_id));

-- ───────────────────────── segmentos ─────────────────────────
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  entity text not null default 'contact' check (entity in ('contact','company','deal')),
  filter jsonb not null default '{"match":"all","rules":[]}'::jsonb,
  is_shared boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists segments_touch on public.segments;
create trigger segments_touch before update on public.segments for each row execute function public.touch_updated_at();
alter table public.segments enable row level security;
drop policy if exists segments_select on public.segments;
create policy segments_select on public.segments for select using (public.is_member(account_id) and (is_shared or created_by = auth.uid()));
drop policy if exists segments_insert on public.segments;
create policy segments_insert on public.segments for insert with check (public.is_member(account_id) and created_by = auth.uid());
drop policy if exists segments_update on public.segments;
create policy segments_update on public.segments for update using (public.is_member(account_id) and (created_by = auth.uid() or public.is_manager(account_id))) with check (public.is_member(account_id));
drop policy if exists segments_delete on public.segments;
create policy segments_delete on public.segments for delete using (created_by = auth.uid() or public.is_manager(account_id));

-- ───────────────────────── consentimento e supressões (LGPD) ─────────────────────────
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','sms','voice','meeting_recording','call_recording')),
  status text not null check (status in ('granted','revoked')),
  basis text not null default 'consent' check (basis in ('consent','legitimate_interest','contract')),
  source text not null default 'manual',
  proof jsonb not null default '{}'::jsonb,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists consents_contact on public.consents (contact_id, channel, created_at desc);
alter table public.consents enable row level security;
drop policy if exists consents_select on public.consents;
create policy consents_select on public.consents for select using (public.is_member(account_id));
drop policy if exists consents_insert on public.consents;
create policy consents_insert on public.consents for insert with check (
  public.is_member(account_id)
  and exists (select 1 from public.contacts c where c.id = contact_id and c.account_id = consents.account_id)
);

-- Estado atual por canal: o último registro vale.
create or replace view public.contact_consent_state with (security_invoker = true) as
select distinct on (contact_id, channel) account_id, contact_id, channel, status, basis, source, created_at
from public.consents
order by contact_id, channel, created_at desc;

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','sms','voice')),
  address text not null,
  reason text not null check (reason in ('unsubscribe','bounce','complaint','manual','dnc','optout_spoken')),
  source text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, channel, address)
);
alter table public.suppressions enable row level security;
drop policy if exists suppressions_select on public.suppressions;
create policy suppressions_select on public.suppressions for select using (public.is_member(account_id));
drop policy if exists suppressions_insert on public.suppressions;
create policy suppressions_insert on public.suppressions for insert with check (public.is_member(account_id));
drop policy if exists suppressions_delete on public.suppressions;
create policy suppressions_delete on public.suppressions for delete using (public.is_manager(account_id));

-- Endereço normalizado: e-mail minúsculo, telefone só dígitos.
create or replace function public.normalize_address(_channel text, _address text) returns text
language sql immutable as $$
  select case when _channel = 'email' then lower(trim(_address))
              else regexp_replace(coalesce(_address, ''), '[^0-9]', '', 'g') end;
$$;

-- Pode contatar? Supressão vence tudo; depois o último consentimento revogado.
create or replace function public.can_contact(_contact uuid, _channel text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare _c public.contacts; _addr text; _state text;
begin
  select * into _c from public.contacts where id = _contact;
  if not found then return false; end if;
  if auth.role() <> 'service_role' and not public.is_member(_c.account_id) then return false; end if;
  _addr := public.normalize_address(_channel, case when _channel = 'email' then _c.email else _c.phone end);
  if coalesce(_addr, '') = '' then return false; end if;
  if exists (select 1 from public.suppressions s where s.account_id = _c.account_id and s.channel = _channel
             and public.normalize_address(_channel, s.address) = _addr) then
    return false;
  end if;
  select status into _state from public.consents
   where contact_id = _contact and channel = _channel order by created_at desc limit 1;
  return coalesce(_state, 'granted') <> 'revoked';
end $$;
grant execute on function public.can_contact(uuid, text) to authenticated;

-- ───────────────────────── linha do tempo 360 ─────────────────────────
-- Uma linha por acontecimento do contato, de qualquer origem. Fases seguintes acrescentam
-- ligações, reuniões, e-mails e tickets redefinindo esta função.
create or replace function public.contact_timeline(_contact uuid, _limit int default 60, _before timestamptz default null)
returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb)
language sql stable security invoker set search_path = public as $$
  with t as (
    select 'message'::text kind, m.id ref_id, m.created_at at,
           case when m.direction = 'in' then 'Mensagem recebida' else 'Mensagem enviada' end title,
           coalesce(m.body, m.transcript, '[' || m.type || ']') body,
           jsonb_build_object('direction', m.direction, 'type', m.type, 'conversation_id', m.conversation_id,
                              'platform', ch.platform, 'sender_type', m.sender_type, 'is_private', m.is_private) meta
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      left join public.channels ch on ch.id = c.channel_id
     where c.contact_id = _contact
    union all
    select 'activity', a.id, coalesce(a.done_at, a.created_at), coalesce(a.title, a.type), a.body,
           jsonb_build_object('type', a.type, 'deal_id', a.deal_id, 'due_at', a.due_at, 'done_at', a.done_at)
      from public.activities a where a.contact_id = _contact
    union all
    select 'event', e.id, e.starts_at, e.title, e.description,
           jsonb_build_object('status', e.status, 'ends_at', e.ends_at, 'meeting_url', e.meeting_url)
      from public.events e where e.contact_id = _contact
    union all
    select 'deal', d.id, d.created_at, 'Negócio: ' || d.title, null,
           jsonb_build_object('status', d.status, 'value', d.value, 'stage_id', d.stage_id)
      from public.deals d where d.contact_id = _contact
    union all
    select 'classification', ac.id, ac.created_at, 'Classificação da IA', ac.summary,
           jsonb_build_object('score', ac.score, 'temperature', ac.temperature)
      from public.ai_classifications ac where ac.contact_id = _contact
    union all
    select 'consent', cs.id, cs.created_at,
           case when cs.status = 'granted' then 'Consentimento registrado' else 'Consentimento revogado' end,
           cs.channel, jsonb_build_object('channel', cs.channel, 'basis', cs.basis, 'source', cs.source)
      from public.consents cs where cs.contact_id = _contact
  )
  select * from t where _before is null or t.at < _before order by at desc limit greatest(1, least(_limit, 200));
$$;
grant execute on function public.contact_timeline(uuid, int, timestamptz) to authenticated;

-- ───────────────────────── "Meu dia" ─────────────────────────
create or replace function public.my_day(_account uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare _uid uuid := auth.uid(); _tz text; _start timestamptz; _end timestamptz;
begin
  if not public.is_member(_account) then raise exception 'forbidden' using errcode = '42501'; end if;
  select timezone into _tz from public.accounts where id = _account;
  _start := (date_trunc('day', now() at time zone coalesce(_tz, 'America/Sao_Paulo'))) at time zone coalesce(_tz, 'America/Sao_Paulo');
  _end := _start + interval '1 day';
  return jsonb_build_object(
    'tasks', coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at nulls last) from (
        select a.id, a.title, a.type, a.due_at, a.contact_id, a.deal_id, ct.name contact_name,
               a.due_at < now() overdue
          from public.activities a left join public.contacts ct on ct.id = a.contact_id
         where a.account_id = _account and a.user_id = _uid and a.done_at is null
           and a.type in ('task','call','email','meeting','whatsapp') and (a.due_at is null or a.due_at < _end)
         order by a.due_at nulls last limit 50) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
        select e.id, e.title, e.starts_at, e.ends_at, e.status, e.meeting_url, e.contact_id, ct.name contact_name
          from public.events e left join public.contacts ct on ct.id = e.contact_id
         where e.account_id = _account and (e.owner_user_id = _uid or e.owner_user_id is null)
           and e.starts_at >= _start and e.starts_at < _end and e.status <> 'canceled'
         order by e.starts_at limit 30) x), '[]'::jsonb),
    'hot_unanswered', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select c.id conversation_id, ct.id contact_id, ct.name, ct.score, c.last_inbound_at, c.last_message_preview
          from public.conversations c join public.contacts ct on ct.id = c.contact_id
         where c.account_id = _account and c.status in ('open','pending') and c.unread_count > 0
           and (c.assignee_user_id = _uid or ct.owner_user_id = _uid)
           and coalesce(ct.score, 0) >= 60
         order by ct.score desc, c.last_inbound_at limit 15) x), '[]'::jsonb),
    'stale_deals', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select d.id, d.title, d.value, d.updated_at, ct.name contact_name
          from public.deals d left join public.contacts ct on ct.id = d.contact_id
         where d.account_id = _account and d.owner_user_id = _uid and d.status = 'open'
           and d.updated_at < now() - interval '7 days'
           and not exists (select 1 from public.activities a where a.deal_id = d.id and a.done_at is null)
         order by d.value desc nulls last limit 15) x), '[]'::jsonb)
  );
end $$;
grant execute on function public.my_day(uuid) to authenticated;

-- ───────────────────────── configuração do agendador (cron → rota /api/public/cron) ─────────────────────────
-- O segredo do cron fica no Vault; o pg_cron e a rota leem do mesmo lugar.
create or replace function public.cron_config() returns jsonb
language plpgsql stable security definer set search_path = public, vault as $$
declare _secret text; _base text;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'platform:cron_secret';
  select decrypted_secret into _base from vault.decrypted_secrets where name = 'platform:app_base_url';
  -- Sem endereço fixo: cada remix grava o seu no primeiro acesso do dono (garantir_plataforma).
  return jsonb_build_object('secret', _secret, 'base_url', _base);
end $$;
revoke all on function public.cron_config() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'platform:cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'platform:cron_secret');
  end if;
  -- platform:app_base_url nasce vazio: o servidor grava a origem do dono no primeiro acesso.
end $$;

-- Dispara a rota do tick (pg_net). Chamado pelo pg_cron a cada minuto.
create or replace function public.cron_tick() returns bigint
language plpgsql security definer set search_path = public, net as $$
declare _cfg jsonb := public.cron_config(); _id bigint;
begin
  select net.http_post(
    url := (_cfg->>'base_url') || '/api/public/cron',
    body := jsonb_build_object('at', now()),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', _cfg->>'secret'),
    timeout_milliseconds := 25000
  ) into _id;
  return _id;
end $$;
revoke all on function public.cron_tick() from public, anon, authenticated;

-- O pg_cron chama public.cron_tick() a cada minuto (agendado em 20261022090200_agendador.sql).
create extension if not exists pg_cron;

-- As rotas de servidor usam a service role: ela precisa executar as funções revogadas do público.
grant execute on function public.cron_config() to service_role;
grant execute on function public.claim_jobs(int, int) to service_role;
grant execute on function public.finish_job(uuid, boolean, text, jsonb) to service_role;
grant execute on function public.emit_event(uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.enqueue_job(uuid, text, jsonb, timestamptz, text) to service_role;
grant execute on function public.notify_user(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.audit(uuid, text, text, uuid, jsonb) to service_role;
