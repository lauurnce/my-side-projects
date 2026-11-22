grant insert (type, points) on public.activities to authenticated;
grant update (points) on public.activities to authenticated;

create or replace function private.sum_activity_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed uuid := coalesce(new.activity_id, old.activity_id);
begin
  update public.activities
  set points = (select coalesce(sum(points), 0) from public.quiz_questions where activity_id = changed)
  where id = changed and type = 'quiz';
  return null;
end;
$$;

create function private.keep_questions_on_quizzes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.activities where id = new.activity_id and type = 'quiz') then
    raise exception 'questions_need_a_quiz' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger keep_questions_on_quizzes
before insert or update of activity_id on public.quiz_questions
for each row execute function private.keep_questions_on_quizzes();

revoke execute on function private.keep_questions_on_quizzes() from public, anon, authenticated;
