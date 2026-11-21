create function private.deck_budget_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 734003200::bigint;
$$;

create function private.stored_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint from storage.objects;
$$;

create function private.reserved_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(size_bytes), 0)::bigint from public.decks where ready_at is null;
$$;

create function public.reserve_deck(
  target_class uuid,
  deck_title text,
  deck_kind text,
  target_lesson uuid,
  declared_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_id uuid := gen_random_uuid();
  folder text;
  free_bytes bigint;
begin
  if caller is null then
    return jsonb_build_object('status', 'signed_out');
  end if;

  if not exists (select 1 from public.classes where id = target_class and teacher_id = caller) then
    return jsonb_build_object('status', 'refused');
  end if;

  if deck_kind is null or deck_kind not in ('pdf', 'native') then
    return jsonb_build_object('status', 'bad_kind');
  end if;

  if declared_bytes is null or declared_bytes < 1 or declared_bytes > 104857600
    or (deck_kind = 'pdf' and declared_bytes > 52428800) then
    return jsonb_build_object('status', 'too_large');
  end if;

  if target_lesson is not null and not exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    where lessons.id = target_lesson and modules.class_id = target_class
  ) then
    return jsonb_build_object('status', 'bad_lesson');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deck_budget', 3));

  if (select count(*) from public.decks where class_id = target_class) >= 40 then
    return jsonb_build_object('status', 'deck_limit');
  end if;

  if (select count(*) from public.decks where created_by = caller and ready_at is null) >= 3 then
    return jsonb_build_object('status', 'pending_limit');
  end if;

  free_bytes := private.deck_budget_bytes() - private.stored_bytes() - private.reserved_bytes();
  if declared_bytes > free_bytes then
    return jsonb_build_object('status', 'full', 'free_bytes', greatest(free_bytes, 0));
  end if;

  folder := target_class::text || '/' || new_id::text;

  insert into public.decks (id, class_id, lesson_id, title, kind, pdf_path, original_path, size_bytes, created_by)
  values (
    new_id,
    target_class,
    target_lesson,
    deck_title,
    deck_kind,
    folder || '/slides.pdf',
    case when deck_kind = 'native' then folder || '/original.pptx' end,
    declared_bytes,
    caller
  );

  return jsonb_build_object('status', 'reserved', 'deck_id', new_id);
end;
$$;

create function public.complete_deck(target_deck uuid, real_bytes bigint, slides integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  declared bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('deck_budget', 3));

  select size_bytes into declared
  from public.decks
  where id = target_deck and ready_at is null
  for update;

  if declared is null then
    return 'not_pending';
  end if;

  if real_bytes is null or real_bytes < 1 or real_bytes > declared then
    return 'larger_than_declared';
  end if;

  if slides is null or slides not between 1 and 300 then
    return 'bad_slide_count';
  end if;

  update public.decks
  set size_bytes = real_bytes, slide_count = slides, ready_at = now()
  where id = target_deck;

  return 'ready';
end;
$$;

create function public.sweep_decks()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.decks
  where ready_at is null and created_at < now() - interval '6 hours';

  return query
  select objects.name
  from storage.objects
  where objects.bucket_id = 'decks'
    and not exists (
      select 1 from public.decks
      where objects.name in (decks.pdf_path, decks.original_path)
    );
end;
$$;

create function public.storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used_bytes', private.stored_bytes(),
    'reserved_bytes', private.reserved_bytes(),
    'budget_bytes', private.deck_budget_bytes()
  )
  where private.is_teacher();
$$;

revoke execute on function private.deck_budget_bytes() from public, anon, authenticated;
revoke execute on function private.stored_bytes() from public, anon, authenticated;
revoke execute on function private.reserved_bytes() from public, anon, authenticated;
revoke execute on function public.reserve_deck(uuid, text, text, uuid, bigint) from public, anon;
revoke execute on function public.complete_deck(uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function public.sweep_decks() from public, anon, authenticated;
revoke execute on function public.storage_usage() from public, anon;
grant execute on function public.reserve_deck(uuid, text, text, uuid, bigint) to authenticated;
grant execute on function public.complete_deck(uuid, bigint, integer) to service_role;
grant execute on function public.sweep_decks() to service_role;
grant execute on function public.storage_usage() to authenticated;
