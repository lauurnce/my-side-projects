create function private.post_quota(caller uuid, is_teacher boolean, new_thread boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  factor integer := case when is_teacher then 3 else 1 end;
  right_now timestamptz := clock_timestamp();
  last_minute integer;
  last_hour integer;
  last_day integer;
  threads_hour integer;
  threads_day integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('post:' || caller::text, 0)) then
    return 'slow_down';
  end if;

  select
    count(*) filter (where created_at > right_now - interval '60 seconds'),
    count(*) filter (where created_at > right_now - interval '1 hour'),
    count(*)
  into last_minute, last_hour, last_day
  from public.posts
  where author_id = caller and created_at > right_now - interval '1 day';

  if last_minute >= 5 then
    return 'slow_down';
  end if;
  if last_hour >= 20 * factor or last_day >= 60 * factor then
    return 'limit_reached';
  end if;

  if new_thread then
    select
      count(*) filter (where created_at > right_now - interval '1 hour'),
      count(*)
    into threads_hour, threads_day
    from public.threads
    where created_by = caller and created_at > right_now - interval '1 day';

    if threads_hour >= 3 * factor or threads_day >= 6 * factor then
      return 'limit_reached';
    end if;
  end if;

  return null;
end;
$$;

create function private.poster_name(caller uuid, target_class uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when classes.teacher_id = caller then own.full_name
    when private.normalize_answer(own.full_name) = private.normalize_answer(teacher.full_name) then null
    else own.full_name
  end
  from public.classes
  join public.profiles teacher on teacher.id = classes.teacher_id
  join public.profiles own on own.id = caller
  where classes.id = target_class;
$$;

create function public.ask_question(
  target_lesson uuid,
  target_activity uuid,
  question_title text,
  question_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_class uuid;
  is_teacher boolean;
  cleaned_title text := btrim(regexp_replace(coalesce(question_title, ''), '\s+', ' ', 'g'));
  cleaned_body text := private.clean_post_body(question_body);
  shown_name text;
  refusal text;
  new_thread uuid := gen_random_uuid();
  new_post uuid := gen_random_uuid();
begin
  if caller is null or (target_lesson is null) = (target_activity is null) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if target_lesson is not null then
    select modules.class_id into target_class
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    where lessons.id = target_lesson
      and (private.teaches_class(modules.class_id)
        or (lessons.published_at is not null and private.is_enrolled(modules.class_id)));
  else
    select activities.class_id into target_class
    from public.activities
    where activities.id = target_activity
      and (private.teaches_class(activities.class_id)
        or (activities.published_at is not null and private.is_enrolled(activities.class_id)));
  end if;

  if target_class is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not private.is_thread_title(cleaned_title) then
    return jsonb_build_object('status', 'bad_title');
  end if;
  if not private.is_post_body(cleaned_body) then
    return jsonb_build_object('status', 'bad_body');
  end if;

  is_teacher := private.teaches_class(target_class);
  shown_name := private.poster_name(caller, target_class);
  if shown_name is null then
    return jsonb_build_object('status', 'bad_name');
  end if;

  refusal := private.post_quota(caller, is_teacher, true);
  if refusal is not null then
    return jsonb_build_object('status', refusal);
  end if;

  if (
    select count(*) from public.threads
    where lesson_id is not distinct from target_lesson and activity_id is not distinct from target_activity
  ) >= 50 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.threads (id, class_id, lesson_id, activity_id, title, created_by, created_at)
  values (new_thread, target_class, target_lesson, target_activity, cleaned_title, caller, clock_timestamp());

  insert into public.posts (id, thread_id, author_id, author_name, body, is_question)
  values (new_post, new_thread, caller, shown_name, cleaned_body, true);

  return jsonb_build_object('status', 'asked', 'thread_id', new_thread, 'post_id', new_post);
end;
$$;

create function public.add_post(target_thread uuid, target_parent uuid, post_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  thread public.threads%rowtype;
  parent public.posts%rowtype;
  cleaned_body text := private.clean_post_body(post_body);
  is_teacher boolean;
  shown_name text;
  refusal text;
  new_post uuid := gen_random_uuid();
begin
  if caller is null or not private.sees_thread(target_thread) then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into thread from public.threads where id = target_thread;

  if target_parent is not null then
    select * into parent from public.posts where id = target_parent;
    if parent.id is null or parent.thread_id <> target_thread or not private.sees_post(target_parent) then
      return jsonb_build_object('status', 'not_found');
    end if;
    if parent.parent_id is not null then
      return jsonb_build_object('status', 'bad_parent');
    end if;
  end if;

  if thread.locked then
    return jsonb_build_object('status', 'locked');
  end if;
  if not private.is_post_body(cleaned_body) then
    return jsonb_build_object('status', 'bad_body');
  end if;

  is_teacher := private.teaches_class(thread.class_id);
  shown_name := private.poster_name(caller, thread.class_id);
  if shown_name is null then
    return jsonb_build_object('status', 'bad_name');
  end if;

  refusal := private.post_quota(caller, is_teacher, false);
  if refusal is not null then
    return jsonb_build_object('status', refusal);
  end if;

  if (select count(*) from public.posts where thread_id = target_thread) >= 200 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.posts (id, thread_id, author_id, author_name, body, parent_id)
  values (new_post, target_thread, caller, shown_name, cleaned_body, target_parent);

  perform private.touch_thread(target_thread);
  return jsonb_build_object('status', 'posted', 'post_id', new_post);
end;
$$;

create function public.edit_post(target_post uuid, post_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  post public.posts%rowtype;
  cleaned_body text := private.clean_post_body(post_body);
begin
  select * into post from public.posts where id = target_post for update;

  if caller is null or post.id is null or post.author_id is distinct from caller
    or post.hidden_at is not null or not private.sees_post(target_post) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if (select locked from public.threads where id = post.thread_id) then
    return jsonb_build_object('status', 'locked');
  end if;
  if clock_timestamp() > post.created_at + interval '15 minutes' then
    return jsonb_build_object('status', 'too_late');
  end if;
  if post.edit_count >= 3 then
    return jsonb_build_object('status', 'too_many_edits');
  end if;
  if not private.is_post_body(cleaned_body) then
    return jsonb_build_object('status', 'bad_body');
  end if;
  if cleaned_body = post.body then
    return jsonb_build_object('status', 'unchanged');
  end if;

  insert into public.post_events (post_id, actor_id, kind, old_body)
  values (target_post, caller, 'edit', post.body);

  update public.posts
  set body = cleaned_body, edited_at = clock_timestamp(), edit_count = edit_count + 1
  where id = target_post;

  perform private.touch_thread(post.thread_id);
  return jsonb_build_object('status', 'edited');
end;
$$;

create function public.set_post_hidden(target_post uuid, hide boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  post public.posts%rowtype;
begin
  select * into post from public.posts where id = target_post for update;

  if caller is null or post.id is null or hide is null or not private.moderates_thread(post.thread_id) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if hide = (post.hidden_at is not null) then
    return jsonb_build_object('status', case when hide then 'hidden' else 'shown' end);
  end if;

  insert into public.post_events (post_id, actor_id, kind)
  values (target_post, caller, case when hide then 'hide' else 'unhide' end);

  update public.posts
  set hidden_at = case when hide then clock_timestamp() end, hidden_by = case when hide then caller end
  where id = target_post;

  perform private.touch_thread(post.thread_id);
  return jsonb_build_object('status', case when hide then 'hidden' else 'shown' end);
end;
$$;

create function public.set_thread_locked(target_thread uuid, lock boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or lock is null or not private.moderates_thread(target_thread) then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.threads
  set locked = lock,
    locked_by = case when lock then caller end,
    locked_at = case when lock then clock_timestamp() end
  where id = target_thread and locked is distinct from lock;

  if found then
    perform private.touch_thread(target_thread);
  end if;
  return jsonb_build_object('status', case when lock then 'locked' else 'unlocked' end);
end;
$$;

create function public.class_threads(target_class uuid)
returns table (
  thread_id uuid,
  lesson_id uuid,
  activity_id uuid,
  target_title text,
  title text,
  author_name text,
  author_role text,
  created_at timestamptz,
  locked boolean,
  replies bigint,
  last_post_at timestamptz,
  hidden_posts bigint,
  question_hidden boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with moderator as (
    select exists (
      select 1 from public.classes where id = target_class and teacher_id = (select auth.uid())
    ) as yes
  ),
  shown as (
    select
      posts.thread_id,
      posts.is_question,
      posts.created_at,
      posts.hidden_at is not null or parent.hidden_at is not null as concealed
    from public.posts
    join public.threads on threads.id = posts.thread_id
    left join public.posts parent on parent.id = posts.parent_id
    where threads.class_id = target_class
  )
  select
    threads.id,
    threads.lesson_id,
    threads.activity_id,
    coalesce(lessons.title, activities.title),
    threads.title,
    question.author_name,
    case when question.author_id = classes.teacher_id then 'teacher' else 'student' end,
    threads.created_at,
    threads.locked,
    (select count(*) from shown
      where shown.thread_id = threads.id and not shown.is_question and (moderator.yes or not shown.concealed)),
    (select max(shown.created_at) from shown
      where shown.thread_id = threads.id and (moderator.yes or not shown.concealed)),
    case when moderator.yes
      then (select count(*) from shown where shown.thread_id = threads.id and shown.concealed)
      else 0
    end,
    moderator.yes and question.hidden_at is not null
  from public.threads
  join public.classes on classes.id = threads.class_id
  join public.posts question on question.thread_id = threads.id and question.is_question
  left join public.lessons on lessons.id = threads.lesson_id
  left join public.activities on activities.id = threads.activity_id
  cross join moderator
  where threads.class_id = target_class
    and private.sees_thread(threads.id)
  order by 11 desc nulls last, threads.id
  limit 200;
$$;

create function public.thread_view(target_thread uuid, known_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  thread public.threads%rowtype;
  moderator boolean;
  teacher uuid;
  right_now timestamptz := clock_timestamp();
begin
  if caller is null or not private.sees_thread(target_thread) then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into thread from public.threads where id = target_thread;
  if known_version is not null and known_version = thread.version then
    return jsonb_build_object('status', 'unchanged', 'version', thread.version);
  end if;

  select teacher_id into teacher from public.classes where id = thread.class_id;
  moderator := teacher = caller;

  return jsonb_build_object(
    'status', 'ok',
    'version', thread.version,
    'thread', jsonb_build_object(
      'id', thread.id,
      'class_id', thread.class_id,
      'lesson_id', thread.lesson_id,
      'activity_id', thread.activity_id,
      'target_title', coalesce(
        (select title from public.lessons where id = thread.lesson_id),
        (select title from public.activities where id = thread.activity_id)
      ),
      'title', thread.title,
      'locked', thread.locked,
      'can_moderate', moderator
    ),
    'posts', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', posts.id,
          'parent_id', posts.parent_id,
          'is_question', posts.is_question,
          'author_name', posts.author_name,
          'author_role', case when posts.author_id = teacher then 'teacher' else 'student' end,
          'mine', posts.author_id is not distinct from caller,
          'can_edit', posts.author_id is not distinct from caller
            and posts.hidden_at is null
            and not thread.locked
            and posts.edit_count < 3
            and right_now <= posts.created_at + interval '15 minutes',
          'body', posts.body,
          'created_at', posts.created_at,
          'edited_at', posts.edited_at
        ) || case
          when moderator then jsonb_build_object(
            'hidden', posts.hidden_at is not null,
            'author_id', posts.author_id,
            'author_in_class', coalesce(posts.author_id = teacher, false) or exists (
              select 1 from public.enrollments
              where enrollments.class_id = thread.class_id and enrollments.student_id = posts.author_id
            ),
            'edit_count', posts.edit_count
          )
          else '{}'::jsonb
        end
        order by posts.created_at, posts.id
      ), '[]'::jsonb)
      from public.posts
      left join public.posts parent on parent.id = posts.parent_id
      where posts.thread_id = target_thread
        and (moderator or (posts.hidden_at is null and parent.hidden_at is null))
    )
  );
end;
$$;

create function public.post_history(target_post uuid)
returns table (kind text, old_body text, actor_name text, happened_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select post_events.kind, post_events.old_body, profiles.full_name, post_events.happened_at
  from public.post_events
  join public.posts on posts.id = post_events.post_id
  left join public.profiles on profiles.id = post_events.actor_id
  where post_events.post_id = target_post
    and private.moderates_thread(posts.thread_id)
  order by post_events.happened_at, post_events.id;
$$;

revoke execute on function private.post_quota(uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function private.poster_name(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ask_question(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.add_post(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.edit_post(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_post_hidden(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.set_thread_locked(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.class_threads(uuid) from public, anon, authenticated;
revoke execute on function public.thread_view(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.post_history(uuid) from public, anon, authenticated;
grant execute on function public.ask_question(uuid, uuid, text, text) to authenticated;
grant execute on function public.add_post(uuid, uuid, text) to authenticated;
grant execute on function public.edit_post(uuid, text) to authenticated;
grant execute on function public.set_post_hidden(uuid, boolean) to authenticated;
grant execute on function public.set_thread_locked(uuid, boolean) to authenticated;
grant execute on function public.class_threads(uuid) to authenticated;
grant execute on function public.thread_view(uuid, bigint) to authenticated;
grant execute on function public.post_history(uuid) to authenticated;
