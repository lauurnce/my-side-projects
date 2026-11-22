create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete cascade,
  attempt_no integer not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  score integer,
  max_score integer not null,
  answers_seen_at timestamptz,
  constraint quiz_attempts_number_unique unique (activity_id, student_id, attempt_no),
  constraint quiz_attempts_number_positive check (attempt_no >= 1),
  constraint quiz_attempts_max_score_positive check (max_score > 0),
  constraint quiz_attempts_score_range check (score between 0 and max_score),
  constraint quiz_attempts_score_with_submit check ((score is null) = (submitted_at is null))
);

create unique index quiz_attempts_one_open_per_student on public.quiz_attempts (activity_id, student_id)
  where submitted_at is null;
create index quiz_attempts_student_id_idx on public.quiz_attempts (student_id);

alter table public.quiz_attempts enable row level security;

revoke all on public.quiz_attempts from anon, authenticated;
grant select on public.quiz_attempts to authenticated;

create policy quiz_attempts_select_own_or_taught
on public.quiz_attempts for select to authenticated
using (
  (student_id = (select auth.uid()) and private.takes_activity(activity_id))
  or private.teaches_activity(activity_id)
);

create table public.quiz_attempt_answers (
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete restrict,
  answer jsonb,
  is_correct boolean,
  saved_at timestamptz not null default now(),
  constraint quiz_attempt_answers_pkey primary key (attempt_id, question_id)
);

create index quiz_attempt_answers_question_id_idx on public.quiz_attempt_answers (question_id);

alter table public.quiz_attempt_answers enable row level security;

revoke all on public.quiz_attempt_answers from anon, authenticated;
grant select on public.quiz_attempt_answers to authenticated;

create function private.teaches_attempt(target_attempt uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quiz_attempts
    join public.activities on activities.id = quiz_attempts.activity_id
    join public.classes on classes.id = activities.class_id
    where quiz_attempts.id = target_attempt
      and classes.teacher_id = (select auth.uid())
  );
$$;

revoke execute on function private.teaches_attempt(uuid) from public, anon;
grant execute on function private.teaches_attempt(uuid) to authenticated, service_role;

create policy quiz_attempt_answers_select_by_teacher
on public.quiz_attempt_answers for select to authenticated
using (private.teaches_attempt(attempt_id));

create function private.guard_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_attempts boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.published_at := null;
    new.points := 0;
  end if;

  if new.lesson_id is not null and not exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    where lessons.id = new.lesson_id and modules.class_id = new.class_id
  ) then
    raise exception 'activity_lesson_outside_class' using errcode = '23514';
  end if;

  if new.requires_deck_id is not null and not exists (
    select 1 from public.decks
    where id = new.requires_deck_id and class_id = new.class_id and ready_at is not null
  ) then
    raise exception 'activity_deck_outside_class' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  has_attempts := exists (select 1 from public.quiz_attempts where activity_id = new.id);

  if has_attempts and new.time_limit_min is distinct from old.time_limit_min then
    raise exception 'activity_has_attempts' using errcode = '23514';
  end if;

  if has_attempts and old.published_at is not null and new.published_at is null then
    raise exception 'activity_has_attempts' using errcode = '23514';
  end if;

  if old.published_at is not null and new.published_at is not null then
    new.published_at := old.published_at;
  end if;

  if old.published_at is null and new.published_at is not null then
    if not exists (select 1 from public.quiz_questions where activity_id = new.id) or exists (
      select 1
      from public.quiz_questions
      left join public.quiz_answer_keys on quiz_answer_keys.question_id = quiz_questions.id
      where quiz_questions.activity_id = new.id and quiz_answer_keys.question_id is null
    ) then
      raise exception 'activity_not_ready' using errcode = '23514';
    end if;
    new.published_at := now();
  end if;

  return new;
end;
$$;

create trigger guard_activity
before insert or update on public.activities
for each row execute function private.guard_activity();

create function private.follow_due_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quiz_attempts
  set expires_at = least(started_at + make_interval(mins => new.time_limit_min), new.due_at)
  where activity_id = new.id and submitted_at is null;
  return null;
end;
$$;

create trigger follow_due_change
after update of due_at on public.activities
for each row
when (new.due_at is distinct from old.due_at)
execute function private.follow_due_change();

revoke execute on function private.guard_activity() from public, anon, authenticated;
revoke execute on function private.follow_due_change() from public, anon, authenticated;
