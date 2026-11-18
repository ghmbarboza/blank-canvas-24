-- Nexus One · mensageria unificada: canais (várias instâncias por provedor), contatos com
-- várias identidades, conversas (1:1 e grupo), mensagens e eventos brutos de webhook.

revoke execute on function public.secret_set(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.secret_set(uuid, text, uuid, text, text) to authenticated, service_role;
revoke execute on function public.secret_keys(uuid, text, uuid) from public, anon;
grant execute on function public.secret_keys(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- canais
-- provider = quem transporta; platform = a rede que o cliente final usa.
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('whatsapp_cloud','evolution','zernio','twilio_sms','webchat')),
  platform text not null check (platform in (
    'whatsapp','instagram','facebook','linkedin','tiktok','telegram','x','threads',
    'bluesky','reddit','youtube','google_business','sms','webchat')),
  name text not null check (length(trim(name)) between 1 and 80),
  external_id text,              -- phone_number_id, nome da instância, accountId da Zernio
  handle text,                   -- número ou @ exibido
  status text not null default 'pending' check (status in ('pending','connecting','connected','disconnected','error')),
  status_detail text,
  config jsonb not null default '{}'::jsonb,   -- nunca segredo
  owner_user_id uuid references auth.users(id) on delete set null, -- vendedor dono da instância
  is_shared boolean not null default true,     -- false = só o dono (e gestores) vê
  ai_enabled boolean not null default false,
  webhook_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Índice comum (não parcial) para servir de alvo a ON CONFLICT; NULLs continuam distintos.
create unique index if not exists channels_provider_external_uq
  on public.channels(provider, external_id);
create index if not exists channels_account_idx on public.channels(account_id);
drop trigger if exists channels_touch on public.channels;
create trigger channels_touch before update on public.channels
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- contatos
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text,
  avatar_url text,
  email text,
  phone text,
  company text,
  job_title text,
  city text,
  notes text,
  tags text[] not null default '{}',
  source text,                       -- canal ou origem do primeiro contato
  lifecycle text not null default 'lead' check (lifecycle in ('lead','opportunity','customer','inactive')),
  owner_user_id uuid references auth.users(id) on delete set null,
  -- classificação por IA
  score smallint check (score between 0 and 100),
  temperature text check (temperature in ('hot','warm','cold')),
  ai_intent text,
  ai_summary text,
  ai_next_step text,
  classified_at timestamptz,
  custom jsonb not null default '{}'::jsonb,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_account_idx on public.contacts(account_id, last_interaction_at desc nulls last);
create index if not exists contacts_name_trgm on public.contacts using gin (name extensions.gin_trgm_ops);
create index if not exists contacts_phone_idx on public.contacts(account_id, phone);
create index if not exists contacts_email_idx on public.contacts(account_id, lower(email));
drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Uma pessoa, várias identidades (telefone no WhatsApp, @ no Instagram, URN no LinkedIn...).
create table if not exists public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  platform text not null,
  handle text not null,
  display_name text,
  created_at timestamptz not null default now(),
  unique (account_id, platform, handle)
);
create index if not exists contact_identities_contact_idx on public.contact_identities(contact_id);

-- ---------------------------------------------------------------- conversas
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null, -- null em grupo
  external_thread_id text not null,   -- remoteJid, conversationId da Zernio, wa_id
  is_group boolean not null default false,
  title text,                         -- nome do grupo
  avatar_url text,
  status text not null default 'open' check (status in ('open','pending','snoozed','closed')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  snoozed_until timestamptz,
  unread_count integer not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,        -- janela de 24 h
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, external_thread_id)
);
create index if not exists conversations_inbox_idx on public.conversations(account_id, status, last_message_at desc nulls last);
create index if not exists conversations_contact_idx on public.conversations(contact_id);
create index if not exists conversations_assignee_idx on public.conversations(assignee_user_id);
drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- mensagens
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender_type text not null check (sender_type in ('contact','user','ai','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_name text,                  -- autor dentro de grupo
  sender_handle text,
  type text not null default 'text' check (type in (
    'text','image','audio','video','document','sticker','location','contact','template','reaction','note','system')),
  body text,
  media_url text,
  media_mime text,
  media_name text,
  transcript text,
  is_private boolean not null default false, -- nota interna
  external_id text,
  reply_to_external_id text,
  status text not null default 'received' check (status in ('queued','sent','delivered','read','failed','received')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists messages_external_uq
  on public.messages(conversation_id, external_id) where external_id is not null;
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists messages_account_idx on public.messages(account_id, created_at desc);

-- Mantém a conversa e o contato atualizados a cada mensagem.
create or replace function public.on_message_inserted() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _preview text;
begin
  _preview := case
    when new.is_private then null
    when new.type = 'text' then left(new.body, 160)
    when new.type = 'audio' then '🎤 ' || coalesce(left(new.transcript, 140), 'Áudio')
    when new.type = 'image' then '📷 ' || coalesce(left(new.body, 140), 'Imagem')
    when new.type = 'video' then '🎬 ' || coalesce(left(new.body, 140), 'Vídeo')
    when new.type = 'document' then '📎 ' || coalesce(new.media_name, 'Documento')
    else left(coalesce(new.body, new.type), 160)
  end;
  if _preview is not null then
    update conversations set
      last_message_at = new.created_at,
      last_message_preview = _preview,
      last_inbound_at = case when new.direction = 'in' then new.created_at else last_inbound_at end,
      unread_count = case when new.direction = 'in' then unread_count + 1 else 0 end,
      status = case when new.direction = 'in' and status in ('closed','snoozed') then 'open' else status end
    where id = new.conversation_id;
  end if;
  update contacts c set last_interaction_at = new.created_at
  from conversations cv
  where cv.id = new.conversation_id and c.id = cv.contact_id;
  return new;
end $$;
revoke execute on function public.on_message_inserted() from public;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_inserted();

-- ---------------------------------------------------------------- eventos brutos
create table if not exists public.inbound_events (
  id bigint generated always as identity primary key,
  provider text not null,
  channel_id uuid references public.channels(id) on delete set null,
  event_type text,
  external_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','processed','ignored','error')),
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists inbound_events_dedupe_uq
  on public.inbound_events(provider, external_id) where external_id is not null;
create index if not exists inbound_events_channel_idx on public.inbound_events(channel_id, created_at desc);

-- ---------------------------------------------------------------- visibilidade
-- Vendedor vê: canais compartilhados, canais dele e conversas atribuídas a ele.
create or replace function public.can_see_channel(_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    join memberships m on m.account_id = c.account_id and m.user_id = auth.uid() and m.is_active
    where c.id = _channel
      and (m.role in ('owner','admin','manager') or c.is_shared or c.owner_user_id = auth.uid())
  );
$$;

create or replace function public.can_see_conversation(_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations cv
    where cv.id = _conversation
      and (public.can_see_channel(cv.channel_id) or (cv.assignee_user_id = auth.uid() and public.is_member(cv.account_id)))
  );
$$;
revoke execute on function public.can_see_channel(uuid) from public;
revoke execute on function public.can_see_conversation(uuid) from public;
grant execute on function public.can_see_channel(uuid) to authenticated, service_role;
grant execute on function public.can_see_conversation(uuid) to authenticated, service_role;

alter table public.channels enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.inbound_events enable row level security; -- só service_role

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select to authenticated
  using (public.can_see_channel(id));
drop policy if exists channels_write on public.channels;
create policy channels_write on public.channels for all to authenticated
  using (public.has_role(account_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner','admin']::public.app_role[]));

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.is_member(account_id) and (
    not public.has_role(account_id, array['seller']::public.app_role[])
    or owner_user_id is null or owner_user_id = auth.uid()));
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.is_member(account_id));
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (public.is_member(account_id) and (
    not public.has_role(account_id, array['seller']::public.app_role[])
    or owner_user_id is null or owner_user_id = auth.uid()))
  with check (public.is_member(account_id));
drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.is_manager(account_id));

drop policy if exists contact_identities_select on public.contact_identities;
create policy contact_identities_select on public.contact_identities for select to authenticated
  using (public.is_member(account_id));
drop policy if exists contact_identities_write on public.contact_identities;
create policy contact_identities_write on public.contact_identities for all to authenticated
  using (public.is_member(account_id)) with check (public.is_member(account_id));

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (public.can_see_conversation(id));
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update to authenticated
  using (public.can_see_conversation(id)) with check (public.is_member(account_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.can_see_conversation(conversation_id));
-- Nota interna pode ser escrita direto; envio para o canal passa pela edge function.
drop policy if exists messages_insert_note on public.messages;
create policy messages_insert_note on public.messages for insert to authenticated
  with check (is_private and type = 'note' and sender_user_id = auth.uid()
              and public.can_see_conversation(conversation_id));

-- ---------------------------------------------------------------- realtime
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null; when undefined_object then null; end $$;
