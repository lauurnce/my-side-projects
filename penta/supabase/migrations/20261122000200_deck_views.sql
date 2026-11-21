create table public.deck_views (
  deck_id uuid not null references public.decks (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  slide_no integer not null,
  viewed_at timestamptz not null default now(),
  constraint deck_views_pkey primary key (deck_id, student_id, slide_no),
  constraint deck_views_slide_no_positive check (slide_no >= 1)
);

create index deck_views_student_deck_idx on public.deck_views (student_id, deck_id);

alter table public.deck_views enable row level security;

revoke all on public.deck_views from anon, authenticated;
grant select on public.deck_views to authenticated;
grant insert (deck_id, student_id, slide_no) on public.deck_views to authenticated;
