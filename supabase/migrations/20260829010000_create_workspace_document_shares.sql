create table if not exists public.workspace_document_shares (
  token uuid primary key,
  owner_email text not null,
  file_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_email, file_id)
);

create index if not exists workspace_document_shares_enabled_token_idx
on public.workspace_document_shares (token)
where enabled = true;

alter table public.workspace_document_shares enable row level security;
revoke all on table public.workspace_document_shares from anon;
revoke all on table public.workspace_document_shares from authenticated;
