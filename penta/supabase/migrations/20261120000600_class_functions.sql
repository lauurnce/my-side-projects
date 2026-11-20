create function public.join_class(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned_code text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  target_class uuid;
  miss_count integer;
  oldest_miss timestamptz;
  added_rows integer;
begin
  if caller is null then
    return jsonb_build_object('status', 'signed_out');
  end if;

  if not exists (select 1 from public.profiles where id = caller and role = 'student') then
    return jsonb_build_object('status', 'not_student');
  end if;

  if cleaned_code !~ '^[A-HJ-NP-Z2-9]{10}$' then
    return jsonb_build_object('status', 'malformed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));

  delete from public.join_attempts
  where user_id = caller and attempted_at < clock_timestamp() - interval '15 minutes';

  select count(*), min(attempted_at) into miss_count, oldest_miss
  from public.join_attempts
  where user_id = caller;

  if miss_count >= 5 then
    return jsonb_build_object('status', 'limited', 'retry_at', oldest_miss + interval '15 minutes');
  end if;

  select id into target_class from public.classes where join_code = cleaned_code;

  if target_class is null then
    insert into public.join_attempts (user_id) values (caller);
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.enrollments (class_id, student_id)
  values (target_class, caller)
  on conflict do nothing;
  get diagnostics added_rows = row_count;

  return jsonb_build_object(
    'status', case when added_rows = 1 then 'joined' else 'already' end,
    'class_id', target_class
  );
end;
$$;

create function public.class_join_code(target_class uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select join_code from public.classes
  where id = target_class and teacher_id = (select auth.uid());
$$;

create function public.remove_student(target_class uuid, target_student uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_rows integer;
begin
  if not exists (
    select 1 from public.classes
    where id = target_class and teacher_id = (select auth.uid())
  ) then
    return false;
  end if;

  delete from public.enrollments
  where class_id = target_class and student_id = target_student;
  get diagnostics removed_rows = row_count;

  if removed_rows = 0 then
    return false;
  end if;

  update public.classes
  set join_code = private.generate_join_code()
  where id = target_class;
  return true;
end;
$$;

revoke execute on function public.join_class(text) from public, anon;
revoke execute on function public.class_join_code(uuid) from public, anon;
revoke execute on function public.remove_student(uuid, uuid) from public, anon;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.class_join_code(uuid) to authenticated;
grant execute on function public.remove_student(uuid, uuid) to authenticated;
