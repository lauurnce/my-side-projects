create function private.live_lease()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 minutes';
$$;

create function public.start_live(target_deck uuid, slide integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  deck_slides integer;
  deck_ready timestamptz;
  running_id uuid;
  new_id uuid;
begin
  if caller is null or not private.teaches_deck(target_deck) then
    return jsonb_build_object('status', 'refused');
  end if;

  select slide_count, ready_at into deck_slides, deck_ready
  from public.decks
  where id = target_deck
  for update;

  if deck_ready is null or deck_slides is null then
    return jsonb_build_object('status', 'not_ready');
  end if;

  select id into running_id
  from public.live_sessions
  where deck_id = target_deck
    and ended_at is null
    and active_at > now() - private.live_lease();

  if running_id is not null then
    update public.live_sessions set active_at = now() where id = running_id;
    return jsonb_build_object('status', 'resumed', 'session_id', running_id);
  end if;

  update public.live_sessions set ended_at = now() where deck_id = target_deck and ended_at is null;

  insert into public.live_sessions (deck_id, teacher_id, current_slide)
  values (target_deck, caller, least(greatest(coalesce(slide, 1), 1), deck_slides))
  returning id into new_id;

  return jsonb_build_object('status', 'started', 'session_id', new_id);
end;
$$;

create function private.open_live_session(target_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_deck uuid;
  session_ended timestamptz;
  session_active timestamptz;
begin
  select deck_id, ended_at, active_at into session_deck, session_ended, session_active
  from public.live_sessions
  where id = target_session
  for update;

  if session_deck is null or (select auth.uid()) is null or not private.teaches_deck(session_deck) then
    return 'refused';
  end if;

  if session_ended is not null then
    return 'ended';
  end if;

  if session_active <= now() - private.live_lease() then
    update public.live_sessions set ended_at = now() where id = target_session;
    return 'ended';
  end if;

  return 'open';
end;
$$;

create function public.move_live(target_session uuid, slide integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state text := private.open_live_session(target_session);
  new_revision bigint;
begin
  if state <> 'open' then
    return jsonb_build_object('status', state);
  end if;

  if slide is null or not exists (
    select 1
    from public.live_sessions
    join public.decks on decks.id = live_sessions.deck_id
    where live_sessions.id = target_session and slide between 1 and decks.slide_count
  ) then
    return jsonb_build_object('status', 'bad_slide');
  end if;

  update public.live_sessions
  set current_slide = slide, active_at = now()
  where id = target_session
  returning revision into new_revision;

  return jsonb_build_object('status', 'moved', 'revision', new_revision);
end;
$$;

create function public.touch_live(target_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  state text := private.open_live_session(target_session);
begin
  if state <> 'open' then
    return state;
  end if;

  update public.live_sessions set active_at = now() where id = target_session;
  return 'open';
end;
$$;

create function public.end_live(target_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  state text := private.open_live_session(target_session);
begin
  if state = 'open' then
    update public.live_sessions set ended_at = now() where id = target_session;
    return 'ended';
  end if;
  return state;
end;
$$;

create function public.live_now()
returns table (deck_id uuid, class_id uuid, session_id uuid, current_slide integer, revision bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select decks.id, decks.class_id, live_sessions.id, live_sessions.current_slide, live_sessions.revision
  from public.live_sessions
  join public.decks on decks.id = live_sessions.deck_id
  where live_sessions.ended_at is null
    and live_sessions.active_at > now() - private.live_lease()
    and (private.teaches_deck(decks.id) or private.reads_deck(decks.id));
$$;

create function public.live_state(target_deck uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'session_id', live_sessions.id,
        'current_slide', live_sessions.current_slide,
        'revision', live_sessions.revision,
        'running', live_sessions.ended_at is null and live_sessions.active_at > now() - private.live_lease()
      )
      from public.live_sessions
      where live_sessions.deck_id = target_deck
        and (private.teaches_deck(target_deck) or private.reads_deck(target_deck))
      order by live_sessions.revision desc
      limit 1
    ),
    jsonb_build_object('session_id', null, 'current_slide', null, 'revision', 0, 'running', false)
  );
$$;

create function public.deck_finished(target_deck uuid, target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select count(*) = decks.slide_count
        and max(deck_views.viewed_at) - min(deck_views.viewed_at)
          >= (decks.slide_count - 1) * interval '1 second'
      from public.decks
      join public.deck_views on deck_views.deck_id = decks.id
      where decks.id = target_deck
        and decks.ready_at is not null
        and deck_views.student_id = target_student
        and deck_views.slide_no between 1 and decks.slide_count
        and (
          (select auth.role()) = 'service_role'
          or (target_student = (select auth.uid()) and private.reads_deck(target_deck))
          or (
            private.teaches_deck(target_deck)
            and exists (
              select 1 from public.enrollments
              where enrollments.class_id = decks.class_id and enrollments.student_id = target_student
            )
          )
        )
      group by decks.slide_count
    ),
    false
  );
$$;

revoke execute on function private.live_lease() from public, anon;
revoke execute on function private.open_live_session(uuid) from public, anon, authenticated;
revoke execute on function public.start_live(uuid, integer) from public, anon;
revoke execute on function public.move_live(uuid, integer) from public, anon;
revoke execute on function public.touch_live(uuid) from public, anon;
revoke execute on function public.end_live(uuid) from public, anon;
revoke execute on function public.live_now() from public, anon;
revoke execute on function public.live_state(uuid) from public, anon;
revoke execute on function public.deck_finished(uuid, uuid) from public, anon;
grant execute on function private.live_lease() to authenticated, service_role;
grant execute on function public.start_live(uuid, integer) to authenticated;
grant execute on function public.move_live(uuid, integer) to authenticated;
grant execute on function public.touch_live(uuid) to authenticated;
grant execute on function public.end_live(uuid) to authenticated;
grant execute on function public.live_now() to authenticated;
grant execute on function public.live_state(uuid) to authenticated;
grant execute on function public.deck_finished(uuid, uuid) to authenticated, service_role;
