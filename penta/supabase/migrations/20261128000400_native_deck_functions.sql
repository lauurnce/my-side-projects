create or replace function private.reserved_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(size_bytes), 0)::bigint from public.decks where ready_at is null and kind <> 'native';
$$;

create or replace function public.reserve_deck(
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

  if deck_kind is null or deck_kind not in ('pdf', 'pptx') then
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

  if (select count(*) from public.decks where created_by = caller and ready_at is null and kind <> 'native') >= 3 then
    return jsonb_build_object('status', 'pending_limit');
  end if;

  free_bytes := least(
    private.deck_budget_bytes() - private.bucket_bytes('decks') - private.reserved_bytes(),
    private.storage_free_bytes()
  );
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
    case when deck_kind = 'pptx' then folder || '/original.pptx' end,
    declared_bytes,
    caller
  );

  return jsonb_build_object('status', 'reserved', 'deck_id', new_id);
end;
$$;

create or replace function public.complete_deck(target_deck uuid, real_bytes bigint, slides integer)
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
  where id = target_deck and ready_at is null and kind <> 'native'
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

create or replace function public.sweep_decks()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.decks
  where ready_at is null and kind <> 'native' and created_at < now() - interval '6 hours';

  return query
  select objects.name
  from storage.objects
  where objects.bucket_id = 'decks'
    and not exists (
      select 1 from public.decks
      where objects.name in (decks.pdf_path, decks.original_path)
        or (decks.kind = 'native' and objects.name like decks.class_id::text || '/' || decks.id::text || '/images/%')
    );
end;
$$;

create function private.deck_content_problem(content jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when content is null
      or jsonb_typeof(content) is distinct from 'object'
      or jsonb_typeof(content -> 'slides') is distinct from 'array' then 'bad_content'
    when octet_length(content::text) > 1048576 then 'too_large'
    when jsonb_array_length(content -> 'slides') not between 1 and 60 then 'bad_content'
  end;
$$;

create function private.deck_image_names(content jsonb)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select distinct block ->> 'file'
  from jsonb_array_elements(content -> 'slides') slide
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(slide -> 'blocks') = 'array' then slide -> 'blocks' else '[]'::jsonb end
  ) block
  where block ->> 'type' = 'image';
$$;

create function private.deck_image_bytes(image_folder text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects
  where bucket_id = 'decks' and name like image_folder || '%';
$$;

create function public.create_native_deck(
  editor uuid,
  target_class uuid,
  deck_title text,
  target_lesson uuid,
  content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  problem text := private.deck_content_problem(content);
  content_bytes bigint;
  free_bytes bigint;
begin
  if editor is null or not exists (select 1 from public.classes where id = target_class and teacher_id = editor) then
    return jsonb_build_object('status', 'refused');
  end if;

  if problem is not null or exists (select 1 from private.deck_image_names(content)) then
    return jsonb_build_object('status', coalesce(problem, 'bad_content'));
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

  content_bytes := octet_length(content::text);
  free_bytes := least(
    private.deck_budget_bytes() - private.bucket_bytes('decks') - private.reserved_bytes(),
    private.storage_free_bytes()
  );
  if content_bytes > free_bytes then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.decks (id, class_id, lesson_id, title, kind, size_bytes, slide_count, created_by)
  values (
    new_id,
    target_class,
    target_lesson,
    deck_title,
    'native',
    content_bytes,
    jsonb_array_length(content -> 'slides'),
    editor
  );

  insert into public.deck_contents (deck_id, content, updated_by) values (new_id, content, editor);

  return jsonb_build_object('status', 'created', 'deck_id', new_id);
end;
$$;

create function public.save_deck_content(
  editor uuid,
  target_deck uuid,
  known_version bigint,
  save_id uuid,
  content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deck public.decks%rowtype;
  held public.deck_contents%rowtype;
  running_id uuid;
  problem text;
  image_folder text;
  slides integer;
begin
  select decks.* into deck
  from public.decks
  join public.classes on classes.id = decks.class_id
  where decks.id = target_deck and decks.kind = 'native' and classes.teacher_id = editor
  for update of decks;

  if deck.id is null or known_version is null or save_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select id into running_id
  from public.live_sessions
  where deck_id = target_deck
    and ended_at is null
    and active_at > now() - private.live_lease();

  if running_id is not null then
    return jsonb_build_object('status', 'live', 'session_id', running_id);
  end if;

  select * into held from public.deck_contents where deck_id = target_deck for update;

  if held.version <> known_version then
    if held.last_save_id = save_id then
      return jsonb_build_object('status', 'saved', 'version', held.version);
    end if;
    return jsonb_build_object('status', 'conflict', 'version', held.version);
  end if;

  problem := private.deck_content_problem(content);
  if problem is not null then
    return jsonb_build_object('status', problem);
  end if;

  image_folder := deck.class_id::text || '/' || deck.id::text || '/images/';
  if exists (
    select 1 from private.deck_image_names(content) named (file)
    where named.file is null or not exists (
      select 1 from storage.objects
      where objects.bucket_id = 'decks' and objects.name = image_folder || named.file
    )
  ) then
    return jsonb_build_object('status', 'missing_image');
  end if;

  slides := jsonb_array_length(content -> 'slides');

  update public.deck_contents
  set content = save_deck_content.content,
    version = held.version + 1,
    last_save_id = save_id,
    updated_at = now(),
    updated_by = editor
  where deck_id = target_deck;

  update public.decks
  set slide_count = slides,
    size_bytes = octet_length(save_deck_content.content::text) + private.deck_image_bytes(image_folder)
  where id = target_deck;

  if slides < deck.slide_count then
    delete from public.deck_views where deck_id = target_deck and slide_no > slides;
  end if;

  return jsonb_build_object('status', 'saved', 'version', held.version + 1);
end;
$$;

create function public.publish_native_deck(editor uuid, target_deck uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.decks
  set ready_at = now()
  from public.classes
  where decks.id = target_deck
    and decks.kind = 'native'
    and decks.ready_at is null
    and classes.id = decks.class_id
    and classes.teacher_id = editor;

  return case when found then 'published' else 'not_found' end;
end;
$$;

create function public.deck_image_room(editor uuid, target_deck uuid, image_bytes bigint)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  image_folder text;
begin
  select decks.class_id::text || '/' || decks.id::text || '/images/' into image_folder
  from public.decks
  join public.classes on classes.id = decks.class_id
  where decks.id = target_deck and decks.kind = 'native' and classes.teacher_id = editor;

  if image_folder is null or image_bytes is null or image_bytes < 1 then
    return 'not_found';
  end if;

  if (select count(*) from storage.objects where bucket_id = 'decks' and name like image_folder || '%') >= 40 then
    return 'image_limit';
  end if;

  if image_bytes > least(
    private.deck_budget_bytes() - private.bucket_bytes('decks') - private.reserved_bytes(),
    private.storage_free_bytes()
  ) then
    return 'full';
  end if;

  return 'ok';
end;
$$;

create function public.unused_deck_images(target_deck uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select objects.name
  from public.decks
  join public.deck_contents on deck_contents.deck_id = decks.id
  join storage.objects
    on objects.bucket_id = 'decks'
    and objects.name like decks.class_id::text || '/' || decks.id::text || '/images/%'
  where decks.id = target_deck
    and objects.created_at < now() - interval '24 hours'
    and not exists (
      select 1 from private.deck_image_names(deck_contents.content) named (file)
      where objects.name = decks.class_id::text || '/' || decks.id::text || '/images/' || named.file
    );
$$;

create or replace function public.live_state(target_deck uuid)
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
        'running', live_sessions.ended_at is null and live_sessions.active_at > now() - private.live_lease(),
        'content_version', (select version from public.deck_contents where deck_id = target_deck)
      )
      from public.live_sessions
      where live_sessions.deck_id = target_deck
        and (private.teaches_deck(target_deck) or private.reads_deck(target_deck))
      order by live_sessions.revision desc
      limit 1
    ),
    jsonb_build_object(
      'session_id', null,
      'current_slide', null,
      'revision', 0,
      'running', false,
      'content_version', (
        select version from public.deck_contents
        where deck_id = target_deck
          and (private.teaches_deck(target_deck) or private.reads_deck(target_deck))
      )
    )
  );
$$;

revoke execute on function private.deck_content_problem(jsonb) from public, anon, authenticated;
revoke execute on function private.deck_image_names(jsonb) from public, anon, authenticated;
revoke execute on function private.deck_image_bytes(text) from public, anon, authenticated;
revoke execute on function public.create_native_deck(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_deck_content(uuid, uuid, bigint, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.publish_native_deck(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.deck_image_room(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.unused_deck_images(uuid) from public, anon, authenticated;
grant execute on function public.create_native_deck(uuid, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.save_deck_content(uuid, uuid, bigint, uuid, jsonb) to service_role;
grant execute on function public.publish_native_deck(uuid, uuid) to service_role;
grant execute on function public.deck_image_room(uuid, uuid, bigint) to service_role;
grant execute on function public.unused_deck_images(uuid) to service_role;
