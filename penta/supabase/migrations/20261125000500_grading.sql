create function private.quiz_grace()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '15 seconds';
$$;

create function private.normalize_answer(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(
    regexp_replace(
      normalize(coalesce(value, ''), NFKC),
      '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]',
      '',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  )));
$$;

create function private.clean_options(options jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned jsonb;
  distinct_count integer;
begin
  if options is null or jsonb_typeof(options) <> 'array' then
    return null;
  end if;
  if jsonb_array_length(options) not between 2 and 6 then
    return null;
  end if;
  if exists (select 1 from jsonb_array_elements(options) item where jsonb_typeof(item) <> 'string') then
    return null;
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(options) item
    where btrim(item) = '' or not private.is_clean_text(btrim(item), 300)
  ) then
    return null;
  end if;

  select count(distinct private.normalize_answer(item)) into distinct_count
  from jsonb_array_elements_text(options) item;
  if distinct_count <> jsonb_array_length(options) then
    return null;
  end if;

  select jsonb_agg(btrim(item) order by place) into cleaned
  from jsonb_array_elements_text(options) with ordinality as listed (item, place);
  return cleaned;
end;
$$;

create function private.clean_key(question_kind text, options jsonb, key_answers jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned jsonb;
begin
  if key_answers is null then
    return null;
  end if;

  if question_kind = 'mcq' then
    if jsonb_typeof(key_answers) = 'number' and key_answers::text ~ '^[0-9]{1,2}$'
      and key_answers::text::integer < jsonb_array_length(options) then
      return key_answers;
    end if;
    return null;
  end if;

  if question_kind = 'tf' then
    if jsonb_typeof(key_answers) = 'boolean' then
      return key_answers;
    end if;
    return null;
  end if;

  if question_kind <> 'ident' or jsonb_typeof(key_answers) <> 'array' then
    return null;
  end if;
  if jsonb_array_length(key_answers) not between 1 and 10 then
    return null;
  end if;
  if exists (select 1 from jsonb_array_elements(key_answers) item where jsonb_typeof(item) <> 'string') then
    return null;
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(key_answers) item
    where private.normalize_answer(item) = ''
      or not private.is_clean_text(btrim(regexp_replace(item, '\s+', ' ', 'g')), 200)
  ) then
    return null;
  end if;

  select jsonb_agg(accepted order by place) into cleaned
  from (
    select distinct on (private.normalize_answer(item))
      btrim(regexp_replace(item, '\s+', ' ', 'g')) as accepted,
      place
    from jsonb_array_elements_text(key_answers) with ordinality as listed (item, place)
    order by private.normalize_answer(item), place
  ) kept;
  return cleaned;
end;
$$;

create function private.valid_answer(question_kind text, options jsonb, answer jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if answer is null or jsonb_typeof(answer) = 'null' then
    return true;
  end if;
  if question_kind = 'mcq' then
    return jsonb_typeof(answer) = 'number' and answer::text ~ '^[0-9]{1,2}$'
      and answer::text::integer < jsonb_array_length(options);
  end if;
  if question_kind = 'tf' then
    return jsonb_typeof(answer) = 'boolean';
  end if;
  if question_kind = 'ident' then
    return jsonb_typeof(answer) = 'string' and char_length(answer #>> '{}') <= 200;
  end if;
  return false;
end;
$$;

create function private.is_correct(question_kind text, key_answers jsonb, answer jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  given text;
begin
  if answer is null or key_answers is null or jsonb_typeof(answer) = 'null' then
    return false;
  end if;
  if question_kind = 'mcq' then
    return jsonb_typeof(answer) = 'number' and jsonb_typeof(key_answers) = 'number' and answer = key_answers;
  end if;
  if question_kind = 'tf' then
    return jsonb_typeof(answer) = 'boolean' and jsonb_typeof(key_answers) = 'boolean' and answer = key_answers;
  end if;
  if question_kind <> 'ident' or jsonb_typeof(answer) <> 'string' or jsonb_typeof(key_answers) <> 'array' then
    return false;
  end if;

  given := private.normalize_answer(answer #>> '{}');
  if given = '' then
    return false;
  end if;
  return exists (
    select 1 from jsonb_array_elements_text(key_answers) accepted
    where private.normalize_answer(accepted) = given
  );
end;
$$;

create function private.grade_attempt(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.quiz_attempt_answers (attempt_id, question_id, answer, is_correct)
  select
    quiz_attempts.id,
    quiz_questions.id,
    given.answer,
    private.is_correct(quiz_questions.kind, quiz_answer_keys.answers, given.answer)
  from public.quiz_attempts
  join public.quiz_questions on quiz_questions.activity_id = quiz_attempts.activity_id
  left join public.quiz_answer_keys on quiz_answer_keys.question_id = quiz_questions.id
  left join public.quiz_attempt_answers given
    on given.attempt_id = quiz_attempts.id and given.question_id = quiz_questions.id
  where quiz_attempts.id = target
  on conflict (attempt_id, question_id) do update set is_correct = excluded.is_correct;

  update public.quiz_attempts
  set
    max_score = (
      select coalesce(sum(points), 0) from public.quiz_questions
      where quiz_questions.activity_id = quiz_attempts.activity_id
    ),
    score = (
      select coalesce(sum(quiz_questions.points), 0)
      from public.quiz_attempt_answers
      join public.quiz_questions on quiz_questions.id = quiz_attempt_answers.question_id
      where quiz_attempt_answers.attempt_id = target and quiz_attempt_answers.is_correct
    ),
    submitted_at = coalesce(submitted_at, least(clock_timestamp(), coalesce(expires_at, clock_timestamp())))
  where id = target;
end;
$$;

create function private.settle_expired(target_activity uuid, target_student uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired record;
  settled integer := 0;
begin
  for expired in
    select id from public.quiz_attempts
    where activity_id = target_activity
      and submitted_at is null
      and expires_at + private.quiz_grace() < clock_timestamp()
      and (target_student is null or student_id = target_student)
    for update skip locked
  loop
    perform private.grade_attempt(expired.id);
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;

revoke execute on function private.quiz_grace() from public, anon, authenticated;
revoke execute on function private.normalize_answer(text) from public, anon, authenticated;
revoke execute on function private.clean_options(jsonb) from public, anon, authenticated;
revoke execute on function private.clean_key(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.valid_answer(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.is_correct(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.grade_attempt(uuid) from public, anon, authenticated;
revoke execute on function private.settle_expired(uuid, uuid) from public, anon, authenticated;

create function public.grade_check(question_kind text, key_answers jsonb, answer jsonb)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select private.is_correct(question_kind, key_answers, answer);
$$;

revoke execute on function public.grade_check(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.grade_check(text, jsonb, jsonb) to service_role;
