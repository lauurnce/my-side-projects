create table public.join_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default clock_timestamp()
);

create index join_attempts_user_time_idx on public.join_attempts (user_id, attempted_at);

alter table public.join_attempts enable row level security;

revoke all on public.join_attempts from anon, authenticated;
