create function private.has_no_hidden_characters(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value !~ '[­͏؜ᅟᅠ᠎​-‏ -‮⁠-⁯⠀ㅤ﻿ﾠ￹-￻]'
    and value !~ '[̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯]{4,}';
$$;

create function private.clean_post_body(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    replace(replace(normalize(coalesce(value, ''), NFC), E'\r\n', E'\n'), E'\r', E'\n'),
    E' \t\n'
  );
$$;

create function private.is_post_body(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(value) between 1 and 2000
    and octet_length(value) <= 8000
    and private.is_clean_body(value)
    and private.has_no_hidden_characters(value)
    and value ~ '[^[:space:]]'
    and value !~ E'\n{4,}'
    and array_length(string_to_array(value, E'\n'), 1) <= 60
    and value !~ '(?n)^([ \t]*(>|([-*+]|[0-9]{1,9}[.)])([ \t]+|$))){5,}'
    and value !~ '(?n)^[ \t]{17,}[^ \t\n]';
$$;

create function private.is_thread_title(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value <> ''
    and private.is_clean_text(value, 160)
    and private.has_no_hidden_characters(value);
$$;

revoke execute on function private.has_no_hidden_characters(text) from public, anon, authenticated;
revoke execute on function private.clean_post_body(text) from public, anon, authenticated;
revoke execute on function private.is_post_body(text) from public, anon, authenticated;
revoke execute on function private.is_thread_title(text) from public, anon, authenticated;

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  lesson_id uuid references public.lessons (id) on delete restrict,
  activity_id uuid references public.activities (id) on delete restrict,
  title text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  locked boolean not null default false,
  locked_by uuid references public.profiles (id) on delete set null,
  locked_at timestamptz,
  version bigint not null default 1,
  constraint threads_one_target check ((lesson_id is null) <> (activity_id is null)),
  constraint threads_title_clean check (private.is_thread_title(title))
);

create index threads_class_id_idx on public.threads (class_id, created_at);
create index threads_lesson_id_idx on public.threads (lesson_id);
create index threads_activity_id_idx on public.threads (activity_id);
create index threads_created_by_idx on public.threads (created_by, created_at);
create index threads_locked_by_idx on public.threads (locked_by);

alter table public.threads enable row level security;

revoke all on public.threads from public, anon, authenticated;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete restrict,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  body text not null,
  parent_id uuid references public.posts (id) on delete restrict,
  is_question boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  edit_count smallint not null default 0,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  constraint posts_body_clean check (private.is_post_body(body)),
  constraint posts_author_name_clean check (author_name <> '' and char_length(author_name) <= 120),
  constraint posts_question_is_top_level check (not is_question or parent_id is null),
  constraint posts_edit_count_range check (edit_count between 0 and 3)
);

create unique index posts_one_question_per_thread on public.posts (thread_id) where is_question;
create index posts_thread_created_idx on public.posts (thread_id, created_at);
create index posts_author_created_idx on public.posts (author_id, created_at);
create index posts_parent_id_idx on public.posts (parent_id);
create index posts_hidden_by_idx on public.posts (hidden_by);

alter table public.posts enable row level security;

revoke all on public.posts from public, anon, authenticated;

create table public.post_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  old_body text,
  happened_at timestamptz not null default clock_timestamp(),
  constraint post_events_kind_known check (kind in ('edit', 'hide', 'unhide'))
);

create index post_events_post_idx on public.post_events (post_id, happened_at);
create index post_events_actor_idx on public.post_events (actor_id);

alter table public.post_events enable row level security;

revoke all on public.post_events from public, anon, authenticated;

create function private.keep_reply_one_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.posts
    where id = new.parent_id and thread_id = new.thread_id and parent_id is null
  ) then
    raise exception 'post_parent_not_top_level' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger keep_reply_one_level
before insert or update of parent_id, thread_id on public.posts
for each row execute function private.keep_reply_one_level();

create function private.keep_thread_target_in_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_id is not null and not exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    where lessons.id = new.lesson_id and modules.class_id = new.class_id
  ) then
    raise exception 'thread_target_outside_class' using errcode = '23514';
  end if;

  if new.activity_id is not null and not exists (
    select 1 from public.activities where id = new.activity_id and class_id = new.class_id
  ) then
    raise exception 'thread_target_outside_class' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger keep_thread_target_in_class
before insert or update of lesson_id, activity_id, class_id on public.threads
for each row execute function private.keep_thread_target_in_class();

revoke execute on function private.keep_reply_one_level() from public, anon, authenticated;
revoke execute on function private.keep_thread_target_in_class() from public, anon, authenticated;
