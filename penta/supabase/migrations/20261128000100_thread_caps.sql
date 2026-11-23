create or replace function public.ask_question(
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
  all_threads integer;
  shown_threads integer;
  own_threads integer;
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

  select
    count(*),
    count(question.id) filter (where question.hidden_at is null),
    count(*) filter (where threads.created_by = caller)
  into all_threads, shown_threads, own_threads
  from public.threads
  left join public.posts question on question.thread_id = threads.id and question.is_question
  where threads.lesson_id = target_lesson or threads.activity_id = target_activity;

  if own_threads >= 5 and not is_teacher then
    return jsonb_build_object('status', 'asked_enough');
  end if;
  if shown_threads >= 50 or all_threads >= 300 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.threads (id, class_id, lesson_id, activity_id, title, created_by, created_at)
  values (new_thread, target_class, target_lesson, target_activity, cleaned_title, caller, clock_timestamp());

  insert into public.posts (id, thread_id, author_id, author_name, body, is_question)
  values (new_post, new_thread, caller, shown_name, cleaned_body, true);

  return jsonb_build_object('status', 'asked', 'thread_id', new_thread, 'post_id', new_post);
end;
$$;

create or replace function public.add_post(target_thread uuid, target_parent uuid, post_body text)
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
  all_posts integer;
  shown_posts integer;
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

  select
    count(*),
    count(*) filter (where posts.hidden_at is null and reply_to.hidden_at is null)
  into all_posts, shown_posts
  from public.posts
  left join public.posts reply_to on reply_to.id = posts.parent_id
  where posts.thread_id = target_thread;

  if shown_posts >= 200 or all_posts >= 500 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.posts (id, thread_id, author_id, author_name, body, parent_id)
  values (new_post, target_thread, caller, shown_name, cleaned_body, target_parent);

  perform private.touch_thread(target_thread);
  return jsonb_build_object('status', 'posted', 'post_id', new_post);
end;
$$;
