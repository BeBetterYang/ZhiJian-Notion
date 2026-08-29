drop table if exists public.workspace_document_shares cascade;
drop table if exists public.workspace_states cascade;

create table public.workspace_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb,
  nodes jsonb,
  trash jsonb,
  updated_at timestamptz not null default now()
);

create table public.workspace_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id text not null,
  tree jsonb not null,
  schema_version integer not null default 1 check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

create table public.workspace_assets (
  asset_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  created_at timestamptz not null default now()
);

create table public.workspace_document_shares (
  token uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  file_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, file_id),
  foreign key (owner_user_id, file_id)
    references public.workspace_documents(user_id, file_id)
    on delete cascade
);

create index workspace_document_shares_enabled_token_idx
  on public.workspace_document_shares (token)
  where enabled = true;
create index workspace_assets_user_id_idx on public.workspace_assets (user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-images', 'workspace-images', false, 10485760, array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.workspace_states enable row level security;
alter table public.workspace_documents enable row level security;
alter table public.workspace_assets enable row level security;
alter table public.workspace_document_shares enable row level security;

revoke all on table public.workspace_states from anon, authenticated;
revoke all on table public.workspace_documents from anon, authenticated;
revoke all on table public.workspace_assets from anon, authenticated;
revoke all on table public.workspace_document_shares from anon, authenticated;

