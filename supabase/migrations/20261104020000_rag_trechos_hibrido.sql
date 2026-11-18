-- Base de conhecimento v2 (RAG): o artigo vira trechos com sobreposição, cada trecho tem o seu
-- vetor (Gemini Embedding 2 do gateway, 1536 dimensões) com índice HNSW, e a busca funde texto
-- (português) e vetor por RRF (k = 60). Antes: um vetor por artigo inteiro (só com chave da
-- OpenAI), sem índice vetorial e nota somando ts_rank com cosseno.

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  article_id uuid not null references public.kb_articles(id) on delete cascade,
  idx int not null check (idx >= 0),
  content text not null check (length(content) between 1 and 8000),
  embedding extensions.vector(1536),
  embedding_model text,
  search tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at timestamptz not null default now(),
  unique (article_id, idx)
);
create index if not exists kb_chunks_account on public.kb_chunks (account_id);
create index if not exists kb_chunks_search on public.kb_chunks using gin (search);
create index if not exists kb_chunks_embedding on public.kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.kb_chunks enable row level security;
drop policy if exists kb_chunks_select on public.kb_chunks;
create policy kb_chunks_select on public.kb_chunks for select using (public.is_member(account_id));
-- escrita só pelo servidor (job kb.embed, service_role)
revoke insert, update, delete on table public.kb_chunks from anon, authenticated;
revoke all on table public.kb_chunks from anon;

alter table public.kb_articles add column if not exists embedding_model text;
alter table public.kb_articles add column if not exists chunk_count int not null default 0;

-- Texto mudou: trechos e vetor antigos deixam de valer (o job refaz).
create or replace function public.tg_kb_reset_embedding() returns trigger language plpgsql
set search_path = public as $$
begin
  if new.title is distinct from old.title or new.body_md is distinct from old.body_md
     or new.category is distinct from old.category then
    new.embedding := null; new.embedded_at := null; new.embedding_model := null; new.chunk_count := 0;
    delete from public.kb_chunks where article_id = new.id;
  end if;
  return new;
end $$;

-- Busca híbrida por RRF. _model: o modelo do vetor da pergunta (vetor de outro modelo não se compara).
drop function if exists public.kb_search(uuid, text, extensions.vector, int, boolean);
create or replace function public.kb_search(
  _account uuid, _query text, _embedding extensions.vector default null, _limit int default 5,
  _public_only boolean default false, _model text default null
) returns table (id uuid, title text, slug text, category text, body_md text, visibility text, score real)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  _k constant int := 60;
  _pool constant int := 40;
begin
  if auth.role() <> 'service_role' and not public.is_member(_account) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- HNSW com filtro por conta: a busca iterativa continua até achar trechos desta conta
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  perform set_config('hnsw.ef_search', '100', true);
  return query
  with q as (
    -- "ou" entre as palavras: a pergunta do cliente raramente traz todas as palavras do artigo
    -- os lexemas já saem com o radical do português: 'simple' não mexe neles de novo
    select to_tsquery('simple', coalesce(nullif(array_to_string(array(
      select quote_literal(w) || ':*' from unnest(tsvector_to_array(to_tsvector('portuguese', coalesce(_query, '')))) w
    ), ' | '), ''), 'xyzzysemtermo')) tsq
  ),
  arts as (
    select a.* from public.kb_articles a
     where a.account_id = _account and a.status = 'published'
       and (not _public_only or a.visibility = 'public')
  ),
  -- passagens: os trechos; artigo ainda sem trecho entra inteiro (até o job rodar)
  passages as (
    select c.article_id, c.content, c.search, c.embedding, c.embedding_model
      from public.kb_chunks c join arts a on a.id = c.article_id
    union all
    select a.id, left(a.body_md, 4000), a.search, a.embedding, a.embedding_model
      from arts a where a.chunk_count = 0
  ),
  txt as (
    select p.article_id, p.content, row_number() over (order by ts_rank_cd(p.search, q.tsq) desc) as r
      from passages p, q where p.search @@ q.tsq
     order by ts_rank_cd(p.search, q.tsq) desc limit _pool
  ),
  vec as (
    select p.article_id, p.content, row_number() over (order by p.embedding <=> _embedding) as r
      from passages p
     where _embedding is not null and p.embedding is not null
       and (_model is null or p.embedding_model is not distinct from _model)
       and (p.embedding <=> _embedding) < 0.75
     order by p.embedding <=> _embedding limit _pool
  ),
  fused as (
    select f.article_id, f.content, sum(1.0 / (_k + f.r)) as s
      from (select * from txt union all select * from vec) f
     group by f.article_id, f.content
  ),
  best as (
    -- até 2 passagens por artigo, as melhores, na ordem do texto
    select f.article_id, string_agg(f.content, E'\n…\n' order by f.s desc) as content, max(f.s) as s
      from (select fu.*, row_number() over (partition by fu.article_id order by fu.s desc) as n from fused fu) f
     where f.n <= 2
     group by f.article_id
  )
  select a.id, a.title, a.slug, a.category, b.content, a.visibility, b.s::real
    from best b join arts a on a.id = b.article_id
   order by b.s desc limit greatest(1, least(_limit, 20));
end $$;
revoke all on function public.kb_search(uuid, text, extensions.vector, int, boolean, text) from public, anon;
grant execute on function public.kb_search(uuid, text, extensions.vector, int, boolean, text) to authenticated, service_role;

-- A assinatura nova entra na lista do garantir_privilegios() (senão ele revoga o EXECUTE).
do $$ declare d text; begin
  d := pg_get_functiondef('public.garantir_privilegios()'::regprocedure);
  if position('_public_only boolean, _model text' in d) = 0 then
    d := replace(d,
      '''kb_search(_account uuid, _query text, _embedding vector, _limit integer, _public_only boolean)''',
      '''kb_search(_account uuid, _query text, _embedding vector, _limit integer, _public_only boolean, _model text)''');
    execute d;
  end if;
end $$;
revoke all on function public.garantir_privilegios() from public, anon, authenticated;
grant execute on function public.garantir_privilegios() to service_role;

-- O vetor antigo (OpenAI, artigo inteiro) não se compara com o novo: todos os artigos refazem.
update public.kb_articles set embedding = null, embedded_at = null, embedding_model = null, chunk_count = 0
 where embedding is not null or chunk_count > 0;
select public.enqueue_job(_account => a.account_id, _kind => 'kb.embed',
       _payload => jsonb_build_object('article_id', a.id), _dedupe => 'kb.embed:' || a.id)
  from public.kb_articles a;
