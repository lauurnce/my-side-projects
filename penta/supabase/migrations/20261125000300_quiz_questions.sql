create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  kind text not null,
  prompt text not null,
  options jsonb,
  points integer not null default 1,
  position integer not null,
  constraint quiz_questions_kind_known check (kind in ('mcq', 'tf', 'ident')),
  constraint quiz_questions_prompt_clean check (
    prompt <> '' and private.is_clean_body(prompt) and char_length(prompt) <= 2000
  ),
  constraint quiz_questions_options_for_mcq check ((kind = 'mcq') = (options is not null)),
  constraint quiz_questions_points_range check (points between 1 and 100)
);

create index quiz_questions_activity_position_idx on public.quiz_questions (activity_id, position);

alter table public.quiz_questions enable row level security;

revoke all on public.quiz_questions from anon, authenticated;
grant select on public.quiz_questions to authenticated;

create policy quiz_questions_select_by_teacher
on public.quiz_questions for select to authenticated
using (private.teaches_activity(activity_id));

create table public.quiz_answer_keys (
  question_id uuid primary key references public.quiz_questions (id) on delete cascade,
  answers jsonb not null
);

alter table public.quiz_answer_keys enable row level security;

revoke all on public.quiz_answer_keys from anon, authenticated;

create function private.sum_activity_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed uuid := coalesce(new.activity_id, old.activity_id);
begin
  update public.activities
  set points = (select coalesce(sum(points), 0) from public.quiz_questions where activity_id = changed)
  where id = changed;
  return null;
end;
$$;

create trigger sum_activity_points
after insert or delete or update of points on public.quiz_questions
for each row execute function private.sum_activity_points();

revoke execute on function private.sum_activity_points() from public, anon, authenticated;
