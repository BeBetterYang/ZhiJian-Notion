create table if not exists public.workspace_states (
  email text primary key,
  profile jsonb,
  nodes jsonb,
  documents jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_states enable row level security;

revoke all on table public.workspace_states from anon;
revoke all on table public.workspace_states from authenticated;

