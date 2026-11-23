alter table public.decks
  alter column pdf_path drop not null,
  drop constraint decks_kind_known,
  drop constraint decks_pdf_path_from_ids;

alter table public.decks
  add constraint decks_kind_known check (kind in ('pdf', 'pptx', 'native')),
  add constraint decks_pdf_path_from_ids check (
    pdf_path is not distinct from
      case when kind <> 'native' then class_id::text || '/' || id::text || '/slides.pdf' end
  );

create table public.deck_contents (
  deck_id uuid primary key references public.decks (id) on delete cascade,
  content jsonb not null,
  version bigint not null default 1,
  last_save_id uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint deck_contents_is_object check (jsonb_typeof(content) = 'object'),
  constraint deck_contents_size check (octet_length(content::text) <= 1048576),
  constraint deck_contents_version_positive check (version >= 1)
);

create index deck_contents_updated_by_idx on public.deck_contents (updated_by);

alter table public.deck_contents enable row level security;

revoke all on public.deck_contents from public, anon, authenticated;
grant select on public.deck_contents to authenticated;

create policy deck_contents_select_teacher_or_reader
on public.deck_contents for select to authenticated
using (private.teaches_deck(deck_id) or private.reads_deck(deck_id));
