create table public.decks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  lesson_id uuid references public.lessons (id) on delete restrict,
  title text not null,
  kind text not null,
  pdf_path text not null,
  original_path text,
  slide_count integer,
  size_bytes bigint not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint decks_title_clean check (title <> '' and private.is_clean_text(title, 120)),
  constraint decks_kind_known check (kind in ('pdf', 'native')),
  constraint decks_size_range check (size_bytes between 1 and 104857600),
  constraint decks_slide_count_range check (slide_count between 1 and 300),
  constraint decks_ready_has_slides check (ready_at is null or slide_count is not null),
  constraint decks_pdf_path_from_ids check (pdf_path = class_id::text || '/' || id::text || '/slides.pdf'),
  constraint decks_original_path_from_ids check (
    original_path is not distinct from
      case when kind = 'native' then class_id::text || '/' || id::text || '/original.pptx' end
  )
);

create index decks_class_id_idx on public.decks (class_id, created_at);
create index decks_lesson_id_idx on public.decks (lesson_id);
create index decks_created_by_idx on public.decks (created_by);

alter table public.decks enable row level security;

revoke all on public.decks from anon, authenticated;
grant select on public.decks to authenticated;
grant update (title, lesson_id) on public.decks to authenticated;

create function private.keep_deck_lesson_in_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.lessons
    join public.modules on modules.id = lessons.module_id
    where lessons.id = new.lesson_id
      and modules.class_id = new.class_id
  ) then
    raise exception 'deck_lesson_outside_class' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger keep_deck_lesson_in_class
before insert or update of lesson_id, class_id on public.decks
for each row execute function private.keep_deck_lesson_in_class();

revoke execute on function private.keep_deck_lesson_in_class() from public, anon, authenticated;
