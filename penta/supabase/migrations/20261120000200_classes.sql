create function private.generate_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(random_bytes.value, position) & 31) + 1, 1),
    ''
  )
  from (select extensions.gen_random_bytes(10) as value) as random_bytes,
    generate_series(0, 9) as position;
$$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  section text not null default '',
  term text not null default '',
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  join_code text not null default private.generate_join_code(),
  created_at timestamptz not null default now(),
  constraint classes_code_clean check (code <> '' and private.is_clean_text(code, 20)),
  constraint classes_title_clean check (title <> '' and private.is_clean_text(title, 120)),
  constraint classes_section_clean check (private.is_clean_text(section, 40)),
  constraint classes_term_clean check (private.is_clean_text(term, 40)),
  constraint classes_join_code_unique unique (join_code),
  constraint classes_join_code_format check (join_code ~ '^[A-HJ-NP-Z2-9]{10}$')
);

create index classes_teacher_id_idx on public.classes (teacher_id);

alter table public.classes enable row level security;

revoke all on public.classes from anon, authenticated;
grant select (id, code, title, section, term, teacher_id, created_at) on public.classes to authenticated;
grant insert (code, title, section, term, teacher_id) on public.classes to authenticated;
grant update (code, title, section, term) on public.classes to authenticated;
