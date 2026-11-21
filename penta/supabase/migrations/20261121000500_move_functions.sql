create function public.move_module(target uuid, step integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  moving public.modules%rowtype;
  neighbour public.modules%rowtype;
begin
  if step is null or step not in (-1, 1) then
    return 'not_found';
  end if;

  select * into moving from public.modules where id = target;
  if not found or not private.teaches_class(moving.class_id) then
    return 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(moving.class_id::text, 1));
  select * into moving from public.modules where id = target;

  if step = -1 then
    select * into neighbour from public.modules
    where class_id = moving.class_id and (position, id) < (moving.position, moving.id)
    order by position desc, id desc limit 1;
  else
    select * into neighbour from public.modules
    where class_id = moving.class_id and (position, id) > (moving.position, moving.id)
    order by position, id limit 1;
  end if;

  if neighbour.id is null then
    return 'edge';
  end if;

  update public.modules set position = neighbour.position where id = moving.id;
  update public.modules set position = moving.position where id = neighbour.id;
  return 'moved';
end;
$$;

create function public.move_lesson(target uuid, step integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  moving public.lessons%rowtype;
  neighbour public.lessons%rowtype;
begin
  if step is null or step not in (-1, 1) then
    return 'not_found';
  end if;

  select * into moving from public.lessons where id = target;
  if not found or not private.teaches_module(moving.module_id) then
    return 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(moving.module_id::text, 2));
  select * into moving from public.lessons where id = target;

  if step = -1 then
    select * into neighbour from public.lessons
    where module_id = moving.module_id and (position, id) < (moving.position, moving.id)
    order by position desc, id desc limit 1;
  else
    select * into neighbour from public.lessons
    where module_id = moving.module_id and (position, id) > (moving.position, moving.id)
    order by position, id limit 1;
  end if;

  if neighbour.id is null then
    return 'edge';
  end if;

  update public.lessons set position = neighbour.position where id = moving.id;
  update public.lessons set position = moving.position where id = neighbour.id;
  return 'moved';
end;
$$;

revoke execute on function public.move_module(uuid, integer) from public, anon;
revoke execute on function public.move_lesson(uuid, integer) from public, anon;
grant execute on function public.move_module(uuid, integer) to authenticated;
grant execute on function public.move_lesson(uuid, integer) to authenticated;
