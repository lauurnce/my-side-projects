create function private.upload_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 minutes';
$$;

create function public.reserve_submission(
  target_activity uuid,
  file_name text,
  file_kind text,
  declared_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  activity_class uuid;
  cleaned_name text;
  kind_mime text;
  pending public.submission_uploads%rowtype;
  free_bytes bigint;
  new_id uuid := gen_random_uuid();
begin
  if caller is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select class_id into activity_class
  from public.activities
  where id = target_activity and type = 'upload' and published_at is not null;

  if activity_class is null
    or not exists (select 1 from public.enrollments where class_id = activity_class and student_id = caller)
    or not exists (select 1 from public.profiles where id = caller and role = 'student') then
    return jsonb_build_object('status', 'not_found');
  end if;

  if file_kind is null or file_kind not in ('pdf', 'docx') then
    return jsonb_build_object('status', 'bad_kind');
  end if;

  if declared_bytes is null or declared_bytes < 1 or declared_bytes > 26214400 then
    return jsonb_build_object('status', 'too_large');
  end if;

  kind_mime := case file_kind
    when 'pdf' then 'application/pdf'
    else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  end;
  cleaned_name := private.clean_text(regexp_replace(coalesce(file_name, ''), '[/\\]', '', 'g'), 120);
  if cleaned_name = '' then
    cleaned_name := 'file.' || file_kind;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deck_budget', 3));

  if exists (
    select 1 from public.submissions
    where activity_id = target_activity and student_id = caller and graded_at is not null
  ) then
    return jsonb_build_object('status', 'graded');
  end if;

  select * into pending
  from public.submission_uploads
  where activity_id = target_activity and student_id = caller;

  free_bytes := private.storage_free_bytes() + coalesce(pending.declared_bytes, 0);
  if declared_bytes > free_bytes then
    return jsonb_build_object('status', 'full', 'free_bytes', greatest(free_bytes, 0));
  end if;

  if pending.id is not null
    and pending.mime = kind_mime
    and pending.reserved_at > clock_timestamp() - private.upload_window()
    and not exists (
      select 1 from storage.objects where bucket_id = 'submissions' and name = pending.file_path
    ) then
    update public.submission_uploads
    set file_name = cleaned_name, declared_bytes = reserve_submission.declared_bytes
    where id = pending.id;
    return jsonb_build_object('status', 'reserved', 'upload_id', pending.id);
  end if;

  delete from public.submission_uploads where activity_id = target_activity and student_id = caller;

  insert into public.submission_uploads (id, activity_id, student_id, file_path, file_name, mime, declared_bytes, reserved_at)
  values (
    new_id,
    target_activity,
    caller,
    activity_class::text || '/' || target_activity::text || '/' || caller::text || '/' || new_id::text || '.' || file_kind,
    cleaned_name,
    kind_mime,
    declared_bytes,
    clock_timestamp()
  );

  return jsonb_build_object('status', 'reserved', 'upload_id', new_id);
end;
$$;

create function public.complete_submission(target_upload uuid, real_bytes bigint, stored_etag text)
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

create function public.cancel_submission_upload(target_upload uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  delete from public.submission_uploads where id = target_upload;
  if found then
    return 'cancelled';
  end if;
  return 'not_pending';
end;
$$;

create function public.grade_submission(
  target_submission uuid,
  expected_upload uuid,
  new_score integer,
  new_feedback text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  submission public.submissions%rowtype;
  activity_points integer;
  cleaned_feedback text := btrim(coalesce(new_feedback, ''), E' \n\r\t');
begin
  if caller is null then
    return jsonb_build_object('status', 'refused');
  end if;

  select * into submission from public.submissions where id = target_submission for update;
  if submission.id is null or not private.teaches_activity(submission.activity_id) then
    return jsonb_build_object('status', 'refused');
  end if;

  if submission.upload_id is distinct from expected_upload then
    return jsonb_build_object('status', 'changed');
  end if;

  select points into activity_points from public.activities where id = submission.activity_id;
  if new_score is null or new_score < 0 or new_score > activity_points then
    return jsonb_build_object('status', 'bad_score', 'points', activity_points);
  end if;

  if char_length(cleaned_feedback) > 5000 or not private.is_clean_body(cleaned_feedback) then
    return jsonb_build_object('status', 'bad_feedback');
  end if;

  insert into public.submission_grade_log (
    submission_id, activity_id, student_id, old_score, new_score, feedback,
    file_path, file_name, size_bytes, file_etag, graded_by, graded_at
  )
  values (
    submission.id, submission.activity_id, submission.student_id, submission.score, new_score, cleaned_feedback,
    submission.file_path, submission.file_name, submission.size_bytes, submission.file_etag, caller, clock_timestamp()
  );

  update public.submissions
  set score = new_score, feedback = cleaned_feedback, graded_by = caller, graded_at = clock_timestamp()
  where id = target_submission;

  return jsonb_build_object('status', 'graded', 'regrade', submission.graded_at is not null);
end;
$$;

create function public.drop_graded_files(target_activity uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  dropped integer;
begin
  if (select auth.uid()) is null or not private.teaches_activity(target_activity) then
    return 0;
  end if;

  update public.submissions
  set file_path = null, files_removed_at = clock_timestamp()
  where activity_id = target_activity and graded_at is not null and file_path is not null;
  get diagnostics dropped = row_count;
  return dropped;
end;
$$;

create function public.sweep_submissions()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('submission_sweep', 4)) then
    return;
  end if;

  delete from public.submission_uploads where reserved_at < now() - interval '6 hours';

  return query
  select objects.name
  from storage.objects
  where objects.bucket_id = 'submissions'
    and objects.created_at < now() - interval '15 minutes'
    and not exists (select 1 from public.submissions where submissions.file_path = objects.name)
    and not exists (select 1 from public.submission_uploads where submission_uploads.file_path = objects.name)
  limit 200;
end;
$$;

revoke execute on function private.upload_window() from public, anon, authenticated;
revoke execute on function public.reserve_submission(uuid, text, text, bigint) from public, anon, authenticated;
revoke execute on function public.complete_submission(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.cancel_submission_upload(uuid) from public, anon, authenticated;
revoke execute on function public.grade_submission(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.drop_graded_files(uuid) from public, anon, authenticated;
revoke execute on function public.sweep_submissions() from public, anon, authenticated;
grant execute on function public.reserve_submission(uuid, text, text, bigint) to authenticated;
grant execute on function public.grade_submission(uuid, uuid, integer, text) to authenticated;
grant execute on function public.drop_graded_files(uuid) to authenticated;
grant execute on function public.complete_submission(uuid, bigint, text) to service_role;
grant execute on function public.cancel_submission_upload(uuid) to service_role;
grant execute on function public.sweep_submissions() to service_role;
