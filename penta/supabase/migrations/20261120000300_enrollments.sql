create table public.enrollments (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint enrollments_pkey primary key (class_id, student_id)
);

create index enrollments_student_id_idx on public.enrollments (student_id);

alter table public.enrollments enable row level security;

revoke all on public.enrollments from anon, authenticated;
grant select on public.enrollments to authenticated;
