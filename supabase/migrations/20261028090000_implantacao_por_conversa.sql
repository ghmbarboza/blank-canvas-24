-- Implantação por conversa: a pessoa conversa com a "Nexa" e a central se configura.
-- setup_messages: o histórico (segredos colados no chat são trocados por •••• antes de gravar).
-- setup_facts: "o que a Nexa já sabe" da empresa, uma linha por assunto (a pessoa corrige ou apaga).
-- product_wishes: o que o cliente sonha e o produto ainda não faz (a VIA lê para adaptar).
-- kb_documents: a biblioteca de dados (arquivo enviado, página do site ou item do Drive); os trechos
-- indexados ficam em kb_articles (document_id), que os agentes já consultam (kb_search).

create table if not exists public.setup_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (length(content) <= 20000),
  -- ações da resposta (botão de conectar, link para tela, ferramentas usadas) para a tela redesenhar
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists setup_messages_account_created on public.setup_messages (account_id, created_at);
alter table public.setup_messages enable row level security;
drop policy if exists setup_messages_read on public.setup_messages;
create policy setup_messages_read on public.setup_messages for select using (public.is_member(account_id));
-- escrita só pelo servidor (service role): o histórico é o que a IA ouviu, sem edição pela tela

create table if not exists public.setup_facts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  category text not null default 'empresa'
    check (category in ('empresa', 'clientes', 'produtos', 'atendimento', 'vendas', 'equipe', 'canais', 'outros')),
  label text not null check (length(trim(label)) between 1 and 120),
  value text not null check (length(value) between 1 and 4000),
  source text not null default 'ia' check (source in ('ia', 'pessoa', 'site', 'documento')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, key)
);
alter table public.setup_facts enable row level security;
drop policy if exists setup_facts_read on public.setup_facts;
create policy setup_facts_read on public.setup_facts for select using (public.is_member(account_id));
drop policy if exists setup_facts_admin on public.setup_facts;
create policy setup_facts_admin on public.setup_facts for all
  using (public.has_role(account_id, array['owner', 'admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner', 'admin']::public.app_role[]));

create table if not exists public.product_wishes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null default '' check (length(description) <= 4000),
  importance text not null default 'media' check (importance in ('baixa', 'media', 'alta')),
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'planejado', 'feito', 'descartado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_wishes enable row level security;
drop policy if exists product_wishes_read on public.product_wishes;
create policy product_wishes_read on public.product_wishes for select using (public.is_member(account_id));
drop policy if exists product_wishes_admin on public.product_wishes;
create policy product_wishes_admin on public.product_wishes for all
  using (public.has_role(account_id, array['owner', 'admin']::public.app_role[]))
  with check (public.has_role(account_id, array['owner', 'admin']::public.app_role[]));

create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 240),
  source text not null check (source in ('upload', 'site', 'google_drive', 'onedrive', 'texto')),
  source_ref text,
  mime text,
  size_bytes bigint,
  storage_path text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error text,
  chunks int not null default 0,
  chars int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kb_documents_account on public.kb_documents (account_id, created_at desc);
alter table public.kb_documents enable row level security;
drop policy if exists kb_documents_read on public.kb_documents;
create policy kb_documents_read on public.kb_documents for select using (public.is_member(account_id));
drop policy if exists kb_documents_admin_delete on public.kb_documents;
create policy kb_documents_admin_delete on public.kb_documents for delete
  using (public.has_role(account_id, array['owner', 'admin']::public.app_role[]));

alter table public.kb_articles add column if not exists document_id uuid references public.kb_documents(id) on delete cascade;
create index if not exists kb_articles_document on public.kb_articles (document_id);

-- arquivos da biblioteca (privado; o servidor lê com service role para indexar)
insert into storage.buckets (id, name, public, file_size_limit)
values ('kb-docs', 'kb-docs', false, 26214400)
on conflict (id) do nothing;
drop policy if exists kb_docs_upload on storage.objects;
create policy kb_docs_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kb-docs'
    and public.has_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin']::public.app_role[])
  );
drop policy if exists kb_docs_read on storage.objects;
create policy kb_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'kb-docs' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists kb_docs_delete on storage.objects;
create policy kb_docs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'kb-docs'
    and public.has_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin']::public.app_role[])
  );

do $$ begin
  alter publication supabase_realtime add table public.setup_facts;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.kb_documents;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ferramentas da Nexa entram no mesmo registro das ferramentas dos agentes
alter table public.agent_tool_calls drop constraint if exists agent_tool_calls_kind_check;
alter table public.agent_tool_calls add constraint agent_tool_calls_kind_check
  check (kind in ('internal', 'composio', 'read', 'setup'));
