create function private.is_clean_body(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(value) <= 50000
    and octet_length(value) <= 200000
    and value !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩﻿]';
$$;

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete restrict,
  title text not null,
  body_md text not null default '',
  position integer not null default 0,
  est_minutes integer not null default 10,
  published_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_title_clean check (title <> '' and private.is_clean_text(title, 160)),
  constraint lessons_body_clean check (private.is_clean_body(body_md)),
  constraint lessons_est_minutes_range check (est_minutes between 1 and 600)
);

create index lessons_module_position_idx on public.lessons (module_id, position);

alter table public.lessons enable row level security;

revoke all on public.lessons from anon, authenticated;
grant select on public.lessons to authenticated;
grant insert (module_id, title, body_md, est_minutes) on public.lessons to authenticated;
grant update (title, body_md, est_minutes, published_at) on public.lessons to authenticated;
grant delete on public.lessons to authenticated;

create function private.place_new_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sibling_count integer;
  last_position integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.module_id::text, 2));

  select count(*), coalesce(max(position), 0) into sibling_count, last_position
  from public.lessons
  where module_id = new.module_id;

  if sibling_count >= 60 then
    raise exception 'lesson_limit' using errcode = 'P0001';
  end if;

  new.position := last_position + 1;
  new.published_at := null;
  new.revision := 1;
  return new;
end;
$$;

create trigger place_new_lesson
before insert on public.lessons
for each row execute function private.place_new_lesson();

create function private.stamp_lesson_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.published_at := case
    when new.published_at is null then null
    else coalesce(old.published_at, now())
  end;

  if new.title is distinct from old.title
    or new.body_md is distinct from old.body_md
    or new.est_minutes is distinct from old.est_minutes then
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger stamp_lesson_change
before update on public.lessons
for each row execute function private.stamp_lesson_change();

revoke execute on function private.place_new_lesson() from public, anon, authenticated;
revoke execute on function private.stamp_lesson_change() from public, anon, authenticated;
revoke execute on function private.is_clean_body(text) from public, anon;
grant execute on function private.is_clean_body(text) to authenticated, service_role;
