create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete cascade,
  upload_id uuid not null,
  file_path text,
  file_name text not null,
  mime text not null,
  size_bytes bigint not null,
  file_etag text,
  submitted_at timestamptz not null,
  is_late boolean not null default false,
  score integer,
  feedback text,
  graded_by uuid references public.profiles (id) on delete restrict,
  graded_at timestamptz,
  files_removed_at timestamptz,
  constraint submissions_one_per_student unique (activity_id, student_id),
  constraint submissions_file_name_clean check (
    file_name <> '' and private.is_clean_text(file_name, 120) and file_name !~ '[/\\]'
  ),
  constraint submissions_mime_known check (
    mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ),
  constraint submissions_size_range check (size_bytes between 1 and 26214400),
  constraint submissions_path_from_ids check (
    file_path is null or (
      file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx)$'
      and split_part(file_path, '/', 2) = activity_id::text
      and split_part(file_path, '/', 3) = student_id::text
    )
  ),
  constraint submissions_graded_together check (
    (score is null) = (graded_at is null) and (graded_at is null) = (graded_by is null)
  ),
  constraint submissions_score_not_negative check (score >= 0),
  constraint submissions_feedback_clean check (
    feedback is null or (private.is_clean_body(feedback) and char_length(feedback) <= 5000)
  )
);

create unique index submissions_file_path_idx on public.submissions (file_path);
create index submissions_student_id_idx on public.submissions (student_id);
create index submissions_graded_by_idx on public.submissions (graded_by);

alter table public.submissions enable row level security;

revoke all on public.submissions from anon, authenticated;
grant select on public.submissions to authenticated;

create policy submissions_select_own_or_taught
on public.submissions for select to authenticated
using (
  (student_id = (select auth.uid()) and private.takes_activity(activity_id))
  or private.teaches_activity(activity_id)
);

create table public.submission_uploads (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime text not null,
  declared_bytes bigint not null,
  reserved_at timestamptz not null default now(),
  constraint submission_uploads_one_per_student unique (activity_id, student_id),
  constraint submission_uploads_size_range check (declared_bytes between 1 and 26214400),
  constraint submission_uploads_path_from_ids check (
    file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx)$'
    and split_part(file_path, '/', 2) = activity_id::text
    and split_part(file_path, '/', 3) = student_id::text
    and split_part(split_part(file_path, '/', 4), '.', 1) = id::text
  )
);

create unique index submission_uploads_file_path_idx on public.submission_uploads (file_path);
create index submission_uploads_student_id_idx on public.submission_uploads (student_id);

alter table public.submission_uploads enable row level security;

revoke all on public.submission_uploads from anon, authenticated;

create table public.submission_grade_log (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  activity_id uuid not null,
  student_id uuid not null,
  old_score integer,
  new_score integer not null,
  feedback text not null,
  file_path text,
  file_name text not null,
  size_bytes bigint not null,
  file_etag text,
  graded_by uuid not null,
  graded_at timestamptz not null default now()
);

create index submission_grade_log_submission_idx on public.submission_grade_log (submission_id, graded_at);
create index submission_grade_log_activity_idx on public.submission_grade_log (activity_id);

alter table public.submission_grade_log enable row level security;

revoke all on public.submission_grade_log from anon, authenticated;
grant select on public.submission_grade_log to authenticated;

create policy submission_grade_log_select_by_teacher
on public.submission_grade_log for select to authenticated
using (private.teaches_activity(activity_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

create or replace function private.guard_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_work boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.published_at := null;
    if new.type = 'quiz' then
      new.points := 0;
    end if;
  else
    new.type := old.type;
    new.class_id := old.class_id;
  end if;

  if new.type = 'upload' and new.points not between 1 and 1000 then
    raise exception 'activity_points_range' using errcode = '23514';
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

  if new.type = 'quiz' then
    new.points := (select coalesce(sum(points), 0) from public.quiz_questions where activity_id = new.id);
  elsif new.points is distinct from old.points and exists (
    select 1 from public.submissions where activity_id = new.id and graded_at is not null
  ) then
    raise exception 'activity_has_grades' using errcode = '23514';
  end if;

  if new.time_limit_min is distinct from old.time_limit_min
    and exists (select 1 from public.quiz_attempts where activity_id = new.id) then
    raise exception 'activity_has_attempts' using errcode = '23514';
  end if;

  has_work := exists (select 1 from public.quiz_attempts where activity_id = new.id)
    or exists (select 1 from public.submissions where activity_id = new.id)
    or exists (select 1 from public.submission_uploads where activity_id = new.id);

  if has_work and old.published_at is not null and new.published_at is null then
    raise exception 'activity_has_attempts' using errcode = '23514';
  end if;

  if old.published_at is not null and new.published_at is not null then
    new.published_at := old.published_at;
  end if;

  if old.published_at is null and new.published_at is not null then
    if new.type = 'quiz' and (
      not exists (select 1 from public.quiz_questions where activity_id = new.id) or exists (
        select 1
        from public.quiz_questions
        left join public.quiz_answer_keys on quiz_answer_keys.question_id = quiz_questions.id
        where quiz_questions.activity_id = new.id and quiz_answer_keys.question_id is null
      )
    ) then
      raise exception 'activity_not_ready' using errcode = '23514';
    end if;
    new.published_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.follow_due_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quiz_attempts
  set expires_at = least(started_at + make_interval(mins => new.time_limit_min), new.due_at)
  where activity_id = new.id and submitted_at is null;

  update public.submissions
  set is_late = new.due_at is not null and submitted_at >= new.due_at
  where activity_id = new.id;
  return null;
end;
$$;
