create function public.start_attempt(target_activity uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  activity public.activities%rowtype;
  open_id uuid;
  used integer;
  started timestamptz;
  new_id uuid;
begin
  if caller is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into activity
  from public.activities
  where id = target_activity and type = 'quiz' and published_at is not null
  for share;

  if activity.id is null or not exists (
    select 1 from public.enrollments where class_id = activity.class_id and student_id = caller
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_activity::text || caller::text, 7));
  perform private.settle_expired(target_activity, caller);

  select id into open_id
  from public.quiz_attempts
  where activity_id = target_activity and student_id = caller and submitted_at is null;
  if open_id is not null then
    return jsonb_build_object('status', 'resumed', 'attempt_id', open_id);
  end if;

  started := clock_timestamp();
  if activity.due_at is not null and started >= activity.due_at then
    return jsonb_build_object('status', 'closed');
  end if;

  select count(*) into used
  from public.quiz_attempts
  where activity_id = target_activity and student_id = caller;

  if used >= activity.attempt_limit or exists (
    select 1 from public.quiz_attempts
    where activity_id = target_activity and student_id = caller and answers_seen_at is not null
  ) then
    return jsonb_build_object('status', 'limit');
  end if;

  if activity.requires_deck_id is not null and not public.deck_finished(activity.requires_deck_id, caller) then
    return jsonb_build_object('status', 'locked', 'deck_id', activity.requires_deck_id);
  end if;

  insert into public.quiz_attempts (activity_id, student_id, attempt_no, started_at, expires_at, max_score)
  values (
    target_activity,
    caller,
    used + 1,
    started,
    least(started + make_interval(mins => activity.time_limit_min), activity.due_at),
    activity.points
  )
  returning id into new_id;

  return jsonb_build_object('status', 'started', 'attempt_id', new_id);
end;
$$;

create function private.lock_own_attempt(target_attempt uuid)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.quiz_attempts%rowtype;
begin
  select * into attempt from public.quiz_attempts where id = target_attempt for update;
  if attempt.id is null or (select auth.uid()) is null or attempt.student_id <> (select auth.uid())
    or not private.takes_activity(attempt.activity_id) then
    return null;
  end if;
  return attempt;
end;
$$;

create function public.attempt_paper(target_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.quiz_attempts%rowtype := private.lock_own_attempt(target_attempt);
begin
  if attempt.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if attempt.submitted_at is null and attempt.expires_at + private.quiz_grace() < clock_timestamp() then
    perform private.grade_attempt(target_attempt);
    return jsonb_build_object('status', 'submitted', 'activity_id', attempt.activity_id);
  end if;

  if attempt.submitted_at is not null then
    return jsonb_build_object('status', 'submitted', 'activity_id', attempt.activity_id);
  end if;

  return jsonb_build_object(
    'status', 'open',
    'activity_id', attempt.activity_id,
    'attempt_no', attempt.attempt_no,
    'expires_at', attempt.expires_at,
    'now', clock_timestamp(),
    'questions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'kind', kind,
          'prompt', prompt,
          'options', options,
          'points', points,
          'position', position
        )
        order by position, id
      ), '[]'::jsonb)
      from public.quiz_questions
      where activity_id = attempt.activity_id
    ),
    'answers', (
      select coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb)
      from public.quiz_attempt_answers
      where attempt_id = target_attempt and answer is not null
    )
  );
end;
$$;

create function private.store_answer(attempt public.quiz_attempts, target_question uuid, answer jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  question public.quiz_questions%rowtype;
begin
  select * into question
  from public.quiz_questions
  where id = target_question and activity_id = attempt.activity_id;

  if question.id is null or not private.valid_answer(question.kind, question.options, answer) then
    return false;
  end if;

  insert into public.quiz_attempt_answers (attempt_id, question_id, answer, saved_at)
  values (attempt.id, target_question, nullif(answer, 'null'::jsonb), clock_timestamp())
  on conflict (attempt_id, question_id)
  do update set answer = excluded.answer, saved_at = excluded.saved_at;
  return true;
end;
$$;

create function public.save_answer(target_attempt uuid, target_question uuid, answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.quiz_attempts%rowtype := private.lock_own_attempt(target_attempt);
  state text;
begin
  if attempt.id is null then
    return jsonb_build_object('status', 'refused');
  end if;

  state := case
    when attempt.submitted_at is not null then 'submitted'
    when attempt.expires_at + private.quiz_grace() < clock_timestamp() then 'late'
    when private.store_answer(attempt, target_question, answer) then 'saved'
    else 'refused'
  end;

  return jsonb_build_object('status', state, 'expires_at', attempt.expires_at, 'now', clock_timestamp());
end;
$$;

create function public.submit_attempt(target_attempt uuid, answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.quiz_attempts%rowtype := private.lock_own_attempt(target_attempt);
  given record;
begin
  if attempt.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if attempt.submitted_at is null then
    if (attempt.expires_at is null or attempt.expires_at + private.quiz_grace() >= clock_timestamp())
      and jsonb_typeof(answers) = 'object' then
      for given in
        select quiz_questions.id, sent.value
        from jsonb_each(answers) sent
        join public.quiz_questions on quiz_questions.id::text = sent.key
        where quiz_questions.activity_id = attempt.activity_id
      loop
        perform private.store_answer(attempt, given.id, given.value);
      end loop;
    end if;
    perform private.grade_attempt(target_attempt);
    select * into attempt from public.quiz_attempts where id = target_attempt;
  end if;

  return jsonb_build_object(
    'status', 'submitted',
    'activity_id', attempt.activity_id,
    'score', attempt.score,
    'max_score', attempt.max_score
  );
end;
$$;

create function public.attempt_review(target_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.quiz_attempts%rowtype := private.lock_own_attempt(target_attempt);
  activity public.activities%rowtype;
  reveal boolean;
begin
  if attempt.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if attempt.submitted_at is null then
    return jsonb_build_object('status', 'open', 'activity_id', attempt.activity_id);
  end if;

  select * into activity from public.activities where id = attempt.activity_id;

  reveal := case activity.show_answers
    when 'after_submit' then true
    when 'after_due' then
      activity.due_at is not null
      and clock_timestamp() > activity.due_at + interval '1 minute'
      and not exists (
        select 1 from public.quiz_attempts
        where activity_id = attempt.activity_id and student_id = attempt.student_id and submitted_at is null
      )
    else false
  end;

  if reveal and attempt.answers_seen_at is null then
    update public.quiz_attempts set answers_seen_at = clock_timestamp() where id = target_attempt;
  end if;

  return jsonb_build_object(
    'status', 'submitted',
    'activity_id', attempt.activity_id,
    'attempt_no', attempt.attempt_no,
    'score', attempt.score,
    'max_score', attempt.max_score,
    'submitted_at', attempt.submitted_at,
    'reveal', reveal,
    'items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'question_id', quiz_questions.id,
          'kind', quiz_questions.kind,
          'prompt', quiz_questions.prompt,
          'options', quiz_questions.options,
          'points', quiz_questions.points,
          'position', quiz_questions.position,
          'answer', given.answer
        ) || case
          when reveal then jsonb_build_object(
            'is_correct', coalesce(given.is_correct, false),
            'accepted', quiz_answer_keys.answers
          )
          else '{}'::jsonb
        end
        order by quiz_questions.position, quiz_questions.id
      ), '[]'::jsonb)
      from public.quiz_questions
      left join public.quiz_answer_keys on quiz_answer_keys.question_id = quiz_questions.id
      left join public.quiz_attempt_answers given
        on given.attempt_id = target_attempt and given.question_id = quiz_questions.id
      where quiz_questions.activity_id = attempt.activity_id
    )
  );
end;
$$;

revoke execute on function private.lock_own_attempt(uuid) from public, anon, authenticated;
revoke execute on function private.store_answer(public.quiz_attempts, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.start_attempt(uuid) from public, anon;
revoke execute on function public.attempt_paper(uuid) from public, anon;
revoke execute on function public.save_answer(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.submit_attempt(uuid, jsonb) from public, anon;
revoke execute on function public.attempt_review(uuid) from public, anon;
grant execute on function public.start_attempt(uuid) to authenticated;
grant execute on function public.attempt_paper(uuid) to authenticated;
grant execute on function public.save_answer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
grant execute on function public.attempt_review(uuid) to authenticated;
