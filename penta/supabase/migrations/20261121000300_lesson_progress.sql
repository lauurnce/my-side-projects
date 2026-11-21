create table public.lesson_progress (
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  constraint lesson_progress_pkey primary key (lesson_id, student_id)
);

create index lesson_progress_student_id_idx on public.lesson_progress (student_id);

alter table public.lesson_progress enable row level security;

revoke all on public.lesson_progress from anon, authenticated;
grant select on public.lesson_progress to authenticated;
grant insert (lesson_id, student_id) on public.lesson_progress to authenticated;
grant delete on public.lesson_progress to authenticated;
