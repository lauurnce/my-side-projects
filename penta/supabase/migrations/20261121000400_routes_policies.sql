create function private.teaches_module(target_module uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.modules
    join public.classes on classes.id = modules.class_id
    where modules.id = target_module
      and classes.teacher_id = (select auth.uid())
  );
$$;

create function private.studies_module(target_module uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.modules
    join public.enrollments on enrollments.class_id = modules.class_id
    where modules.id = target_module
      and enrollments.student_id = (select auth.uid())
  );
$$;

create function private.teaches_lesson(target_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    join public.classes on classes.id = modules.class_id
    where lessons.id = target_lesson
      and classes.teacher_id = (select auth.uid())
  );
$$;

create function private.studies_lesson(target_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    join public.enrollments on enrollments.class_id = modules.class_id
    where lessons.id = target_lesson
      and lessons.published_at is not null
      and enrollments.student_id = (select auth.uid())
  );
$$;

create function private.teaches_progress(target_lesson uuid, target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    join public.classes on classes.id = modules.class_id
    join public.enrollments on enrollments.class_id = classes.id
    where lessons.id = target_lesson
      and classes.teacher_id = (select auth.uid())
      and enrollments.student_id = target_student
  );
$$;

revoke execute on function private.teaches_module(uuid) from public, anon;
revoke execute on function private.studies_module(uuid) from public, anon;
revoke execute on function private.teaches_lesson(uuid) from public, anon;
revoke execute on function private.studies_lesson(uuid) from public, anon;
revoke execute on function private.teaches_progress(uuid, uuid) from public, anon;
grant execute on function private.teaches_module(uuid) to authenticated, service_role;
grant execute on function private.studies_module(uuid) to authenticated, service_role;
grant execute on function private.teaches_lesson(uuid) to authenticated, service_role;
grant execute on function private.studies_lesson(uuid) to authenticated, service_role;
grant execute on function private.teaches_progress(uuid, uuid) to authenticated, service_role;

create policy modules_select_teacher_or_enrolled
on public.modules for select to authenticated
using (private.teaches_class(class_id) or private.is_enrolled(class_id));

create policy modules_insert_by_teacher
on public.modules for insert to authenticated
with check (private.teaches_class(class_id));

create policy modules_update_by_teacher
on public.modules for update to authenticated
using (private.teaches_class(class_id))
with check (private.teaches_class(class_id));

create policy modules_delete_by_teacher
on public.modules for delete to authenticated
using (private.teaches_class(class_id));

create policy lessons_select_teacher_or_published
on public.lessons for select to authenticated
using (
  private.teaches_module(module_id)
  or (published_at is not null and private.studies_module(module_id))
);

create policy lessons_insert_by_teacher
on public.lessons for insert to authenticated
with check (private.teaches_module(module_id));

create policy lessons_update_by_teacher
on public.lessons for update to authenticated
using (private.teaches_module(module_id))
with check (private.teaches_module(module_id));

create policy lessons_delete_by_teacher
on public.lessons for delete to authenticated
using (private.teaches_module(module_id));

create policy lesson_progress_select_own_or_taught
on public.lesson_progress for select to authenticated
using (
  (student_id = (select auth.uid()) and private.studies_lesson(lesson_id))
  or private.teaches_progress(lesson_id, student_id)
);

create policy lesson_progress_insert_own
on public.lesson_progress for insert to authenticated
with check (student_id = (select auth.uid()) and private.studies_lesson(lesson_id));

create policy lesson_progress_delete_own
on public.lesson_progress for delete to authenticated
using (student_id = (select auth.uid()));
