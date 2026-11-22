create function public.save_quiz_question(
  target_activity uuid,
  target_question uuid,
  question_kind text,
  question_prompt text,
  question_options jsonb,
  question_points integer,
  key_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  published timestamptz;
  cleaned_prompt text := btrim(coalesce(question_prompt, ''), E' \n\r\t');
  cleaned_options jsonb;
  cleaned_key jsonb;
  saved_id uuid;
begin
  if (select auth.uid()) is null or not private.teaches_activity(target_activity) then
    return jsonb_build_object('status', 'refused');
  end if;

  select published_at into published from public.activities where id = target_activity for update;
  if published is not null then
    return jsonb_build_object('status', 'locked');
  end if;

  if question_kind is null or question_kind not in ('mcq', 'tf', 'ident')
    or question_points is null or question_points not between 1 and 100
    or cleaned_prompt = '' or char_length(cleaned_prompt) > 2000
    or not private.is_clean_body(cleaned_prompt) then
    return jsonb_build_object('status', 'bad_question');
  end if;

  if question_kind = 'mcq' then
    cleaned_options := private.clean_options(question_options);
    if cleaned_options is null then
      return jsonb_build_object('status', 'bad_options');
    end if;
  end if;

  cleaned_key := private.clean_key(question_kind, cleaned_options, key_answers);
  if cleaned_key is null then
    return jsonb_build_object('status', 'bad_key');
  end if;

  if target_question is null then
    if (select count(*) from public.quiz_questions where activity_id = target_activity) >= 100 then
      return jsonb_build_object('status', 'question_limit');
    end if;

    insert into public.quiz_questions (activity_id, kind, prompt, options, points, position)
    values (
      target_activity,
      question_kind,
      cleaned_prompt,
      cleaned_options,
      question_points,
      (select coalesce(max(position), 0) + 1 from public.quiz_questions where activity_id = target_activity)
    )
    returning id into saved_id;
  else
    update public.quiz_questions
    set kind = question_kind, prompt = cleaned_prompt, options = cleaned_options, points = question_points
    where id = target_question and activity_id = target_activity
    returning id into saved_id;

    if saved_id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
  end if;

  insert into public.quiz_answer_keys (question_id, answers)
  values (saved_id, cleaned_key)
  on conflict (question_id) do update set answers = excluded.answers;

  return jsonb_build_object('status', 'saved', 'question_id', saved_id);
end;
$$;

create function private.editable_question_activity(target_question uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_activity uuid;
begin
  select activity_id into found_activity from public.quiz_questions where id = target_question;
  if found_activity is null or (select auth.uid()) is null or not private.teaches_activity(found_activity) then
    return null;
  end if;
  return found_activity;
end;
$$;

create function public.delete_quiz_question(target_question uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_activity uuid := private.editable_question_activity(target_question);
  published timestamptz;
begin
  if found_activity is null then
    return 'not_found';
  end if;

  select published_at into published from public.activities where id = found_activity for update;
  if published is not null then
    return 'locked';
  end if;

  delete from public.quiz_questions where id = target_question;
  return 'deleted';
end;
$$;

create function public.move_quiz_question(target_question uuid, step integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_activity uuid := private.editable_question_activity(target_question);
  published timestamptz;
  own_position integer;
  neighbour_id uuid;
  neighbour_position integer;
begin
  if found_activity is null or step is null or step not in (-1, 1) then
    return 'not_found';
  end if;

  select published_at into published from public.activities where id = found_activity for update;
  if published is not null then
    return 'locked';
  end if;

  select position into own_position from public.quiz_questions where id = target_question;

  select id, position into neighbour_id, neighbour_position
  from public.quiz_questions
  where activity_id = found_activity
    and id <> target_question
    and case when step = -1 then position < own_position else position > own_position end
  order by case when step = -1 then -position else position end
  limit 1;

  if neighbour_id is null then
    return 'edge';
  end if;

  update public.quiz_questions set position = neighbour_position where id = target_question;
  update public.quiz_questions set position = own_position where id = neighbour_id;
  return 'moved';
end;
$$;

create function public.quiz_keys(target_activity uuid)
returns table (question_id uuid, answers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select quiz_answer_keys.question_id, quiz_answer_keys.answers
  from public.quiz_answer_keys
  join public.quiz_questions on quiz_questions.id = quiz_answer_keys.question_id
  where quiz_questions.activity_id = target_activity
    and (select auth.uid()) is not null
    and private.teaches_activity(target_activity);
$$;

create function public.rekey_quiz_question(target_question uuid, key_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_activity uuid := private.editable_question_activity(target_question);
  question_kind text;
  question_options jsonb;
  cleaned_key jsonb;
  graded record;
  regraded integer := 0;
begin
  if found_activity is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  perform 1 from public.activities where id = found_activity for update;
  select kind, options into question_kind, question_options from public.quiz_questions where id = target_question;

  cleaned_key := private.clean_key(question_kind, question_options, key_answers);
  if cleaned_key is null then
    return jsonb_build_object('status', 'bad_key');
  end if;

  insert into public.quiz_answer_keys (question_id, answers)
  values (target_question, cleaned_key)
  on conflict (question_id) do update set answers = excluded.answers;

  for graded in
    select id from public.quiz_attempts
    where activity_id = found_activity and submitted_at is not null
    for update
  loop
    perform private.grade_attempt(graded.id);
    regraded := regraded + 1;
  end loop;

  return jsonb_build_object('status', 'rekeyed', 'regraded', regraded);
end;
$$;

create function public.settle_attempts(target_activity uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.teaches_activity(target_activity) then
    return 0;
  end if;
  return private.settle_expired(target_activity, null);
end;
$$;

revoke execute on function private.editable_question_activity(uuid) from public, anon, authenticated;
revoke execute on function public.save_quiz_question(uuid, uuid, text, text, jsonb, integer, jsonb) from public, anon;
revoke execute on function public.delete_quiz_question(uuid) from public, anon;
revoke execute on function public.move_quiz_question(uuid, integer) from public, anon;
revoke execute on function public.quiz_keys(uuid) from public, anon;
revoke execute on function public.rekey_quiz_question(uuid, jsonb) from public, anon;
revoke execute on function public.settle_attempts(uuid) from public, anon;
grant execute on function public.save_quiz_question(uuid, uuid, text, text, jsonb, integer, jsonb) to authenticated;
grant execute on function public.delete_quiz_question(uuid) to authenticated;
grant execute on function public.move_quiz_question(uuid, integer) to authenticated;
grant execute on function public.quiz_keys(uuid) to authenticated;
grant execute on function public.rekey_quiz_question(uuid, jsonb) to authenticated;
grant execute on function public.settle_attempts(uuid) to authenticated;
