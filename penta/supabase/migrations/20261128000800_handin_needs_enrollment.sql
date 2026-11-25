create or replace function public.complete_submission(target_upload uuid, real_bytes bigint, stored_etag text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.submission_uploads%rowtype;
  existing public.submissions%rowtype;
  due timestamptz;
  finished timestamptz;
  recorded timestamptz;
  saved_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;

  select * into pending from public.submission_uploads where id = target_upload for update;
  if pending.id is null then
    return jsonb_build_object('status', 'not_pending');
  end if;

  if not exists (
    select 1
    from public.activities
    join public.enrollments on enrollments.class_id = activities.class_id
    where activities.id = pending.activity_id
      and activities.published_at is not null
      and enrollments.student_id = pending.student_id
  ) then
    delete from public.submission_uploads where id = target_upload;
    return jsonb_build_object('status', 'gone', 'file_path', pending.file_path);
  end if;

  if real_bytes is null or real_bytes < 1 or real_bytes > pending.declared_bytes then
    delete from public.submission_uploads where id = target_upload;
    return jsonb_build_object('status', 'too_large', 'file_path', pending.file_path);
  end if;

  select * into existing
  from public.submissions
  where activity_id = pending.activity_id and student_id = pending.student_id
  for update;

  if existing.graded_at is not null then
    delete from public.submission_uploads where id = target_upload;
    return jsonb_build_object('status', 'graded', 'file_path', pending.file_path);
  end if;

  select due_at into due from public.activities where id = pending.activity_id;
  finished := clock_timestamp();
  recorded := case
    when finished - pending.reserved_at <= private.upload_window() then pending.reserved_at
    else finished
  end;

  insert into public.submissions (
    activity_id, student_id, upload_id, file_path, file_name, mime, size_bytes, file_etag, submitted_at, is_late
  )
  values (
    pending.activity_id,
    pending.student_id,
    pending.id,
    pending.file_path,
    pending.file_name,
    pending.mime,
    real_bytes,
    stored_etag,
    recorded,
    due is not null and recorded >= due
  )
  on conflict (activity_id, student_id) do update set
    upload_id = excluded.upload_id,
    file_path = excluded.file_path,
    file_name = excluded.file_name,
    mime = excluded.mime,
    size_bytes = excluded.size_bytes,
    file_etag = excluded.file_etag,
    submitted_at = excluded.submitted_at,
    is_late = excluded.is_late,
    files_removed_at = null
  returning id into saved_id;

  delete from public.submission_uploads where id = target_upload;

  return jsonb_build_object(
    'status', 'completed',
    'submission_id', saved_id,
    'activity_id', pending.activity_id,
    'old_path', existing.file_path
  );
end;
$$;
