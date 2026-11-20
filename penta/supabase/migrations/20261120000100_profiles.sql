create schema private;
grant usage on schema private to authenticated, service_role;

create function private.is_clean_text(value text, max_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value = btrim(value)
    and char_length(value) <= max_length
    and value !~ '[\u0001-\u001F\u007F​-‏‪-‮⁦-⁩﻿]';
$$;

create function private.clean_text(value text, max_length integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(left(btrim(regexp_replace(
    coalesce(value, ''),
    '[\u0001-\u001F\u007F​-‏‪-‮⁦-⁩﻿]',
    '',
    'g'
  )), max_length));
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  constraint profiles_full_name_clean check (full_name <> '' and private.is_clean_text(full_name, 120)),
  constraint profiles_role_known check (role in ('student', 'teacher'))
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select (id, full_name, role) on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := private.clean_text(new.raw_user_meta_data ->> 'full_name', 120);
begin
  if cleaned_name = '' then
    cleaned_name := private.clean_text(split_part(coalesce(new.email, ''), '@', 1), 120);
  end if;
  if cleaned_name = '' then
    cleaned_name := 'Student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    cleaned_name,
    case when new.raw_app_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function private.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set role = case when new.raw_app_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_role_changed
after update of raw_app_meta_data on auth.users
for each row execute function private.sync_profile_role();

create function private.keep_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.id is distinct from old.id)
    and current_user in ('authenticated', 'anon') then
    raise exception 'role and id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger keep_profile_identity
before update on public.profiles
for each row execute function private.keep_profile_identity();
