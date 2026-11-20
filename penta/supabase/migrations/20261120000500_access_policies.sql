create function private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'
  );
$$;

create function private.teaches_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes
    where id = target_class and teacher_id = (select auth.uid())
  );
$$;

create function private.is_enrolled(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments
    where class_id = target_class and student_id = (select auth.uid())
  );
$$;

create function private.teaches_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments
    join public.classes on classes.id = enrollments.class_id
    where enrollments.student_id = target_student
      and classes.teacher_id = (select auth.uid())
  );
$$;

create function private.learns_from(target_teacher uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments
    join public.classes on classes.id = enrollments.class_id
    where enrollments.student_id = (select auth.uid())
      and classes.teacher_id = target_teacher
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

create policy profiles_select_self_or_class
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.teaches_student(id)
  or private.learns_from(id)
);

create policy profiles_update_own_name
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy classes_select_owner_or_enrolled
on public.classes for select to authenticated
using (teacher_id = (select auth.uid()) or private.is_enrolled(id));

create policy classes_insert_by_teacher
on public.classes for insert to authenticated
with check (teacher_id = (select auth.uid()) and private.is_teacher());

create policy classes_update_by_owner
on public.classes for update to authenticated
using (teacher_id = (select auth.uid()))
with check (teacher_id = (select auth.uid()));

create policy enrollments_select_own_or_taught
on public.enrollments for select to authenticated
using (student_id = (select auth.uid()) or private.teaches_class(class_id));
