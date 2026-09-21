-- Optional production persistence for Signal. Run in a dedicated Supabase project.
-- The local demo does not require this schema.
create extension if not exists vector with schema extensions;

create table if not exists public.transcript_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.transcript_workspaces(id) on delete cascade,
  filename text not null,
  title text not null,
  market text,
  content_sha256 text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, content_sha256)
);

create table if not exists public.transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.transcript_workspaces(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  ordinal integer not null,
  speaker text,
  timestamp_label text,
  start_seconds integer,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  embedding extensions.vector(384),
  unique (transcript_id, ordinal)
);

create index if not exists transcript_chunks_workspace_idx on public.transcript_chunks(workspace_id);
create index if not exists transcript_chunks_search_idx on public.transcript_chunks using gin(search_vector);
create index if not exists transcript_chunks_embedding_idx on public.transcript_chunks using hnsw (embedding vector_cosine_ops);

alter table public.transcript_workspaces enable row level security;
alter table public.transcripts enable row level security;
alter table public.transcript_chunks enable row level security;

-- Server-only hybrid retrieval. RRF combines full-text and semantic ranks.
create or replace function public.hybrid_transcript_search(
  workspace_filter uuid,
  query_text text,
  query_embedding extensions.vector(384),
  match_count integer default 14,
  rrf_k integer default 50
)
returns table (
  id uuid,
  transcript_id uuid,
  speaker text,
  timestamp_label text,
  content text,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from public.transcript_chunks c
    where c.workspace_id = workspace_filter and c.embedding is not null
    order by c.embedding <=> query_embedding
    limit least(match_count * 3, 100)
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.search_vector, websearch_to_tsquery('english', query_text)) desc) as rank
    from public.transcript_chunks c
    where c.workspace_id = workspace_filter
      and c.search_vector @@ websearch_to_tsquery('english', query_text)
    order by ts_rank_cd(c.search_vector, websearch_to_tsquery('english', query_text)) desc
    limit least(match_count * 3, 100)
  )
  select c.id, c.transcript_id, c.speaker, c.timestamp_label, c.content,
    (coalesce(1.0 / (rrf_k + semantic.rank), 0.0) + coalesce(1.0 / (rrf_k + keyword.rank), 0.0))::double precision as score
  from semantic full outer join keyword using (id)
  join public.transcript_chunks c on c.id = coalesce(semantic.id, keyword.id)
  order by score desc
  limit least(match_count, 50);
$$;

revoke all on function public.hybrid_transcript_search(uuid, text, extensions.vector, integer, integer) from public, anon, authenticated;
grant execute on function public.hybrid_transcript_search(uuid, text, extensions.vector, integer, integer) to service_role;

-- No browser policies are intentionally created. Access is server-side only.
-- Add ownership columns and user-scoped policies before exposing this data to clients.
