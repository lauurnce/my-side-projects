create function private.storage_block_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 943718400::bigint;
$$;

create function private.bucket_bytes(target_bucket text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects
  where bucket_id = target_bucket;
$$;

create function private.pending_submission_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(declared_bytes), 0)::bigint from public.submission_uploads;
$$;

create function private.storage_free_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select private.storage_block_bytes() - private.stored_bytes() - private.reserved_bytes()
    - private.pending_submission_bytes();
$$;

revoke execute on function private.storage_block_bytes() from public, anon, authenticated;
revoke execute on function private.bucket_bytes(text) from public, anon, authenticated;
revoke execute on function private.pending_submission_bytes() from public, anon, authenticated;
revoke execute on function private.storage_free_bytes() from public, anon, authenticated;

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
    case when deck_kind = 'native' then folder || '/original.pptx' end,
    declared_bytes,
    caller
  );

  return jsonb_build_object('status', 'reserved', 'deck_id', new_id);
end;
$$;

create or replace function public.storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used_bytes', private.bucket_bytes('decks'),
    'reserved_bytes', private.reserved_bytes(),
    'budget_bytes', private.deck_budget_bytes(),
    'submission_bytes', private.bucket_bytes('submissions'),
    'total_bytes', private.stored_bytes(),
    'block_bytes', private.storage_block_bytes()
  )
  where private.is_teacher();
$$;

create function public.deck_view_counts()
returns table (deck_id uuid, viewed bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select deck_views.deck_id, count(*)
  from public.deck_views
  where deck_views.student_id = (select auth.uid())
  group by deck_views.deck_id;
$$;

revoke execute on function public.deck_view_counts() from public, anon, authenticated;
grant execute on function public.deck_view_counts() to authenticated;
