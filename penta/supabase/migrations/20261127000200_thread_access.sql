create function private.sees_thread(target_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.threads
    join public.classes on classes.id = threads.class_id
    where threads.id = target_thread
      and (select auth.uid()) is not null
      and (
        classes.teacher_id = (select auth.uid())
        or (
          exists (
            select 1 from public.enrollments
            where enrollments.class_id = threads.class_id
              and enrollments.student_id = (select auth.uid())
          )
          and (
            exists (
              select 1 from public.lessons
              where lessons.id = threads.lesson_id and lessons.published_at is not null
            )
            or exists (
              select 1 from public.activities
              where activities.id = threads.activity_id and activities.published_at is not null
            )
          )
          and exists (
            select 1 from public.posts
            where posts.thread_id = threads.id and posts.is_question and posts.hidden_at is null
          )
        )
      )
  );
$$;

create function private.moderates_thread(target_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.threads
    join public.classes on classes.id = threads.class_id
    where threads.id = target_thread
      and classes.teacher_id = (select auth.uid())
  );
$$;

create function private.sees_post(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts
    left join public.posts parent on parent.id = posts.parent_id
    where posts.id = target_post
      and private.sees_thread(posts.thread_id)
      and (
        private.moderates_thread(posts.thread_id)
        or (posts.hidden_at is null and parent.hidden_at is null)
      )
  );
$$;

create function private.thread_topic_id(topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when topic ~ '^thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substring(topic from 8)::uuid
  end;
$$;

revoke execute on function private.sees_thread(uuid) from public, anon;
revoke execute on function private.moderates_thread(uuid) from public, anon;
revoke execute on function private.sees_post(uuid) from public, anon;
revoke execute on function private.thread_topic_id(text) from public, anon;
grant execute on function private.sees_thread(uuid) to authenticated, service_role;
grant execute on function private.moderates_thread(uuid) to authenticated, service_role;
grant execute on function private.sees_post(uuid) to authenticated, service_role;
grant execute on function private.thread_topic_id(text) to authenticated, service_role;

create policy thread_look_for_viewers
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and private.sees_thread(private.thread_topic_id((select realtime.topic())))
);

create function private.touch_thread(target_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.threads set version = version + 1 where id = target_thread;
  begin
    perform realtime.send('{}'::jsonb, 'look', 'thread:' || target_thread::text, true);
  exception when others then
    null;
  end;
end;
$$;

revoke execute on function private.touch_thread(uuid) from public, anon, authenticated;
