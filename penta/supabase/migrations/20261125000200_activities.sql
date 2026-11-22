create table public.activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  lesson_id uuid references public.lessons (id) on delete set null,
  type text not null default 'quiz',
  title text not null,
  instructions_md text not null default '',
  points integer not null default 0,
  due_at timestamptz,
  published_at timestamptz,
  requires_deck_id uuid references public.decks (id) on delete restrict,
  attempt_limit integer not null default 1,
  time_limit_min integer,
  show_answers text not null default 'never',
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint activities_type_known check (type in ('quiz', 'upload')),
  constraint activities_title_clean check (title <> '' and private.is_clean_text(title, 160)),
  constraint activities_instructions_clean check (
    private.is_clean_body(instructions_md) and char_length(instructions_md) <= 10000
  ),
  constraint activities_points_range check (points between 0 and 10000),
  constraint activities_attempt_limit_range check (attempt_limit between 1 and 10),
  constraint activities_time_limit_range check (time_limit_min between 1 and 300),
  constraint activities_show_answers_known check (show_answers in ('after_submit', 'after_due', 'never')),
  constraint activities_after_submit_single_attempt check (show_answers <> 'after_submit' or attempt_limit = 1),
  constraint activities_after_due_needs_due check (show_answers <> 'after_due' or due_at is not null)
);

create index activities_class_id_idx on public.activities (class_id, created_at);
create index activities_lesson_id_idx on public.activities (lesson_id);
create index activities_requires_deck_id_idx on public.activities (requires_deck_id);
create index activities_created_by_idx on public.activities (created_by);

alter table public.activities enable row level security;

revoke all on public.activities from anon, authenticated;
grant select on public.activities to authenticated;
grant insert (class_id, lesson_id, title, instructions_md, due_at, requires_deck_id, attempt_limit, time_limit_min, show_answers)
  on public.activities to authenticated;
grant update (lesson_id, title, instructions_md, due_at, requires_deck_id, attempt_limit, time_limit_min, show_answers, published_at)
  on public.activities to authenticated;
grant delete on public.activities to authenticated;

create function private.teaches_activity(target_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activities
    join public.classes on classes.id = activities.class_id
    where activities.id = target_activity
      and classes.teacher_id = (select auth.uid())
  );
$$;

create function private.takes_activity(target_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activities
    join public.enrollments on enrollments.class_id = activities.class_id
    where activities.id = target_activity
      and activities.published_at is not null
      and enrollments.student_id = (select auth.uid())
  );
$$;

revoke execute on function private.teaches_activity(uuid) from public, anon;
revoke execute on function private.takes_activity(uuid) from public, anon;
grant execute on function private.teaches_activity(uuid) to authenticated, service_role;
grant execute on function private.takes_activity(uuid) to authenticated, service_role;

create policy activities_select_teacher_or_published
on public.activities for select to authenticated
using (private.teaches_class(class_id) or (published_at is not null and private.is_enrolled(class_id)));

create policy activities_insert_by_teacher
on public.activities for insert to authenticated
with check (private.teaches_class(class_id));

create policy activities_update_by_teacher
on public.activities for update to authenticated
using (private.teaches_class(class_id))
with check (private.teaches_class(class_id));

create policy activities_delete_by_teacher
on public.activities for delete to authenticated
using (private.teaches_class(class_id));
