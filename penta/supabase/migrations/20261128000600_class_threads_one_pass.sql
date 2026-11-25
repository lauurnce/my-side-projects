create or replace function public.class_threads(target_class uuid)
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
  tallies as (
    select
      posts.thread_id,
      count(*) filter (where not posts.is_question) as all_replies,
      count(*) filter (where not posts.is_question and posts.hidden_at is null and parent.hidden_at is null) as shown_replies,
      max(posts.created_at) as all_last,
      max(posts.created_at) filter (where posts.hidden_at is null and parent.hidden_at is null) as shown_last,
      count(*) filter (where posts.hidden_at is not null or parent.hidden_at is not null) as concealed
    from public.posts
    join public.threads on threads.id = posts.thread_id
    left join public.posts parent on parent.id = posts.parent_id
    where threads.class_id = target_class
    group by posts.thread_id
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
    case when moderator.yes then tallies.all_replies else tallies.shown_replies end,
    case when moderator.yes then tallies.all_last else tallies.shown_last end,
    case when moderator.yes then tallies.concealed else 0 end,
    moderator.yes and question.hidden_at is not null
  from public.threads
  join public.classes on classes.id = threads.class_id
  join public.posts question on question.thread_id = threads.id and question.is_question
  join tallies on tallies.thread_id = threads.id
  left join public.lessons on lessons.id = threads.lesson_id
  left join public.activities on activities.id = threads.activity_id
  cross join moderator
  where threads.class_id = target_class
    and private.sees_thread(threads.id)
  order by 11 desc nulls last, threads.id
  limit 200;
$$;
