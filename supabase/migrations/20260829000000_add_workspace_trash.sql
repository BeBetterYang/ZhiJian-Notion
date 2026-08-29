alter table public.workspace_states
add column if not exists trash jsonb;
