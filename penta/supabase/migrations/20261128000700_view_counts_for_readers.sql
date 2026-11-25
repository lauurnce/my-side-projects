create or replace function public.deck_view_counts()
returns table (deck_id uuid, viewed bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select deck_views.deck_id, count(*)
  from public.deck_views
  where deck_views.student_id = (select auth.uid())
    and private.reads_deck(deck_views.deck_id)
  group by deck_views.deck_id;
$$;
