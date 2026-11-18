-- Banco descartável: contrato mínimo para testar as funções reais de captação/monitor.
-- Não substitui o ensaio do schema Supabase completo nem as provas de RLS.
create schema auth;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','service_role')
$$;
create function public.is_member(uuid) returns boolean language sql as $$select true$$;
create table accounts(id uuid primary key default gen_random_uuid(),name text,settings jsonb default '{}');
create table platform_settings(multi_account boolean default false);
insert into platform_settings values(true);
create table memberships(account_id uuid,user_id uuid,is_active boolean default true);
create table forms(id uuid primary key default gen_random_uuid(),account_id uuid,name text,
 status text default 'active',destination jsonb default '{}',rr_cursor int default 0,
 submissions_count int default 0);
create table contacts(id uuid primary key default gen_random_uuid(),account_id uuid,name text,
 email text,phone text,company text,job_title text,city text,source text,lifecycle text,
 custom jsonb default '{}',first_touch jsonb,last_touch jsonb,tags text[] default '{}',
 owner_user_id uuid,created_at timestamptz default now());
create table form_submissions(id uuid primary key default gen_random_uuid(),account_id uuid,form_id uuid,
 contact_id uuid,source text,payload jsonb,utm jsonb,referrer text,page_url text,ip_hash text,user_agent text,
 confirm_token text unique,confirmed_at timestamptz,external_id text,visitor_id text,suspect boolean,
 created_at timestamptz default now());
create unique index on form_submissions(account_id,source,external_id) where external_id is not null;
create table page_visits(account_id uuid,visitor_id text,contact_id uuid);
create table consents(id uuid primary key default gen_random_uuid(),account_id uuid,contact_id uuid,
 channel text,status text check(status in ('granted','revoked')),basis text,source text,proof jsonb);
create table pipelines(id uuid primary key default gen_random_uuid(),account_id uuid,
 is_default boolean default true,created_at timestamptz default now());
create table pipeline_stages(id uuid primary key default gen_random_uuid(),account_id uuid,
 pipeline_id uuid,position int default 0);
create table deals(id uuid primary key default gen_random_uuid(),account_id uuid,contact_id uuid,
 owner_user_id uuid,pipeline_id uuid,stage_id uuid,title text,source text,status text default 'open',
 created_at timestamptz default now());
create table jobs(id uuid primary key default gen_random_uuid(),account_id uuid,kind text,
 payload jsonb,run_at timestamptz,dedupe_key text unique);
create table domain_events(account_id uuid,type text,entity text,entity_id uuid,payload jsonb);
create table notifications(account_id uuid,user_id uuid,kind text,title text,body text,link text);
create table service_heartbeats(service text,instance text,last_seen timestamptz);
create table platform_alerts(id uuid primary key default gen_random_uuid(),service text,
 kind text default 'service_down',message text,details jsonb,opened_at timestamptz default now(),
 resolved_at timestamptz,notified_at timestamptz,resolved_notified_at timestamptz);
create unique index on platform_alerts(service,kind) where resolved_at is null;
create table meetings(status text,ended_at timestamptz,started_at timestamptz);
create function hit_rate_limit(text,int,int) returns boolean language sql as $$select true$$;
create function cron_config() returns jsonb language sql as $$select '{"base_url":"https://nexus.test.invalid"}'::jsonb$$;
create function platform_alert_email(text,text) returns boolean language sql as $$select false$$;
