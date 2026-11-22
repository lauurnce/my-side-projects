create function private.grade_cells(target_class uuid, target_student uuid)
returns table (
  student_id uuid,
  activity_id uuid,
  state text,
  score integer,
  points integer,
  late boolean,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with class_activities as (
    select id, type, points, due_at
    from public.activities
    where class_id = target_class and published_at is not null
  ),
  students as (
    select enrollments.student_id, enrollments.joined_at
    from public.enrollments
    where enrollments.class_id = target_class
    union
    select quiz_attempts.student_id, null::timestamptz
    from public.quiz_attempts
    join class_activities on class_activities.id = quiz_attempts.activity_id
    where not exists (
      select 1 from public.enrollments
      where enrollments.class_id = target_class and enrollments.student_id = quiz_attempts.student_id
    )
    union
    select submissions.student_id, null::timestamptz
    from public.submissions
    join class_activities on class_activities.id = submissions.activity_id
    where not exists (
      select 1 from public.enrollments
      where enrollments.class_id = target_class and enrollments.student_id = submissions.student_id
    )
  ),
  work as (
    select
      students.student_id,
      students.joined_at,
      class_activities.id as activity_id,
      class_activities.type,
      class_activities.points,
      class_activities.due_at,
      best.score as best_score,
      best.submitted_at as best_at,
      best.has_open,
      handed.id as submission_id,
      handed.score as given_score,
      handed.graded_at,
      handed.is_late,
      handed.submitted_at as handed_at
    from students
    cross join class_activities
    left join lateral (
      select
        max(quiz_attempts.score) as score,
        max(quiz_attempts.submitted_at) as submitted_at,
        bool_or(quiz_attempts.submitted_at is null) as has_open
      from public.quiz_attempts
      where quiz_attempts.activity_id = class_activities.id
        and quiz_attempts.student_id = students.student_id
    ) best on class_activities.type = 'quiz'
    left join public.submissions handed
      on class_activities.type = 'upload'
      and handed.activity_id = class_activities.id
      and handed.student_id = students.student_id
    where target_student is null or students.student_id = target_student
  )
  select
    work.student_id,
    work.activity_id,
    case
      when work.best_score is not null or work.graded_at is not null then 'graded'
      when work.submission_id is not null then 'submitted'
      when coalesce(work.has_open, false) then 'in_progress'
      when work.due_at is not null and work.due_at <= now()
        and work.joined_at is not null and work.due_at > work.joined_at then 'missing'
      else 'none'
    end,
    case
      when coalesce(work.best_score, work.given_score) is null then null
      else least(coalesce(work.best_score, work.given_score), work.points)
    end,
    work.points,
    coalesce(work.is_late, false),
    coalesce(work.best_at, work.handed_at)
  from work;
$$;

create function private.settle_class(target_class uuid, target_student uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quiz record;
begin
  for quiz in
    select distinct quiz_attempts.activity_id
    from public.quiz_attempts
    join public.activities on activities.id = quiz_attempts.activity_id
    where activities.class_id = target_class
      and quiz_attempts.submitted_at is null
      and quiz_attempts.expires_at + private.quiz_grace() < clock_timestamp()
      and (target_student is null or quiz_attempts.student_id = target_student)
  loop
    perform private.settle_expired(quiz.activity_id, target_student);
  end loop;
end;
$$;

create function public.class_gradebook(target_class uuid)
returns table (
  student_id uuid,
  activity_id uuid,
  state text,
  score integer,
  points integer,
  late boolean,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.teaches_class(target_class) then
    return;
  end if;

  perform private.settle_class(target_class, null);
  return query select * from private.grade_cells(target_class, null);
end;
$$;

create function public.my_grades()
returns table (
  class_id uuid,
  activity_id uuid,
  state text,
  score integer,
  points integer,
  late boolean,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  joined record;
begin
  if caller is null then
    return;
  end if;

  for joined in select enrollments.class_id from public.enrollments where enrollments.student_id = caller loop
    perform private.settle_class(joined.class_id, caller);
    return query
    select joined.class_id, cells.activity_id, cells.state, cells.score, cells.points, cells.late, cells.submitted_at
    from private.grade_cells(joined.class_id, caller) cells;
  end loop;
end;
$$;

create function private.class_altitude(target_class uuid, target_student uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with lessons as (
    select
      count(*) as published,
      count(lesson_progress.lesson_id) as done
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    left join public.lesson_progress
      on lesson_progress.lesson_id = lessons.id and lesson_progress.student_id = target_student
    where modules.class_id = target_class and lessons.published_at is not null
  ),
  visible_decks as (
    select decks.id, decks.slide_count
    from public.decks
    where decks.class_id = target_class
      and decks.ready_at is not null
      and (
        decks.lesson_id is null
        or exists (
          select 1 from public.lessons
          where lessons.id = decks.lesson_id and lessons.published_at is not null
        )
      )
  ),
  deck_progress as (
    select
      visible_decks.id,
      count(deck_views.slide_no) = visible_decks.slide_count
        and max(deck_views.viewed_at) - min(deck_views.viewed_at)
          >= (visible_decks.slide_count - 1) * interval '1 second' as finished
    from visible_decks
    left join public.deck_views
      on deck_views.deck_id = visible_decks.id
      and deck_views.student_id = target_student
      and deck_views.slide_no between 1 and visible_decks.slide_count
    group by visible_decks.id, visible_decks.slide_count
  ),
  decks as (
    select count(*) as total, count(*) filter (where coalesce(finished, false)) as finished from deck_progress
  ),
  points as (
    select
      coalesce(sum(cells.points), 0) as possible,
      coalesce(sum(coalesce(cells.score, 0)), 0) as earned
    from private.grade_cells(target_class, target_student) cells
    where cells.state in ('graded', 'missing')
  ),
  parts as (
    select
      lessons.published, lessons.done, decks.total, decks.finished, points.possible, points.earned,
      (case when lessons.published > 0 then 1200 else 0 end
        + case when decks.total > 0 then 600 else 0 end
        + case when points.possible > 0 then 1200 else 0 end)::numeric as weight,
      (case when lessons.published > 0 then 1200 * lessons.done::numeric / lessons.published else 0 end
        + case when decks.total > 0 then 600 * decks.finished::numeric / decks.total else 0 end
        + case when points.possible > 0 then 1200 * least(points.earned, points.possible)::numeric / points.possible else 0 end
      ) as gained
    from lessons, decks, points
  )
  select jsonb_build_object(
    'class_id', target_class,
    'counts', parts.weight > 0,
    'meters', case when parts.weight > 0 then floor(3000 * parts.gained / parts.weight)::integer else 0 end,
    'lessons_done', parts.done,
    'lessons_published', parts.published,
    'decks_finished', parts.finished,
    'decks', parts.total,
    'points_earned', parts.earned,
    'points_possible', parts.possible
  )
  from parts;
$$;

create function public.student_altitude(target_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  server boolean := (select auth.role()) = 'service_role';
  seen record;
  classes jsonb := '[]'::jsonb;
  one jsonb;
  total numeric := 0;
  counted integer := 0;
begin
  if target_student is null or (caller is null and not server) then
    return null;
  end if;

  for seen in
    select enrollments.class_id
    from public.enrollments
    join public.classes on classes.id = enrollments.class_id
    where enrollments.student_id = target_student
      and (server or caller = target_student or classes.teacher_id = caller)
    order by classes.title, classes.id
  loop
    perform private.settle_class(seen.class_id, target_student);
    one := private.class_altitude(seen.class_id, target_student);
    classes := classes || jsonb_build_array(one);
    if (one ->> 'counts')::boolean then
      total := total + (one ->> 'meters')::numeric;
      counted := counted + 1;
    end if;
  end loop;

  if jsonb_array_length(classes) = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'overall', case when counted > 0 then (floor(total / counted / 10) * 10)::integer else 0 end,
    'classes', classes
  );
end;
$$;

revoke execute on function private.grade_cells(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.settle_class(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.class_altitude(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.class_gradebook(uuid) from public, anon, authenticated;
revoke execute on function public.my_grades() from public, anon, authenticated;
revoke execute on function public.student_altitude(uuid) from public, anon, authenticated;
grant execute on function public.class_gradebook(uuid) to authenticated;
grant execute on function public.my_grades() to authenticated;
grant execute on function public.student_altitude(uuid) to authenticated, service_role;
