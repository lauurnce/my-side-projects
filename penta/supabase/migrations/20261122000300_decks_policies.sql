create function private.teaches_deck(target_deck uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.decks
    join public.classes on classes.id = decks.class_id
    where decks.id = target_deck
      and classes.teacher_id = (select auth.uid())
  );
$$;

create function private.reads_deck(target_deck uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.decks
    join public.enrollments on enrollments.class_id = decks.class_id
    where decks.id = target_deck
      and decks.ready_at is not null
      and enrollments.student_id = (select auth.uid())
      and (
        decks.lesson_id is null
        or exists (
          select 1 from public.lessons
          where lessons.id = decks.lesson_id and lessons.published_at is not null
        )
      )
  );
$$;

create function private.views_slide(target_deck uuid, target_slide integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.reads_deck(target_deck)
    and exists (
      select 1 from public.decks
      where decks.id = target_deck and target_slide between 1 and decks.slide_count
    );
$$;

revoke execute on function private.teaches_deck(uuid) from public, anon;
revoke execute on function private.reads_deck(uuid) from public, anon;
revoke execute on function private.views_slide(uuid, integer) from public, anon;
grant execute on function private.teaches_deck(uuid) to authenticated, service_role;
grant execute on function private.reads_deck(uuid) to authenticated, service_role;
grant execute on function private.views_slide(uuid, integer) to authenticated, service_role;

create policy decks_select_teacher_or_reader
on public.decks for select to authenticated
using (private.teaches_class(class_id) or private.reads_deck(id));

create policy decks_update_by_teacher
on public.decks for update to authenticated
using (private.teaches_class(class_id))
with check (private.teaches_class(class_id));

create policy deck_views_select_own_or_taught
on public.deck_views for select to authenticated
using (
  (student_id = (select auth.uid()) and private.reads_deck(deck_id))
  or private.teaches_deck(deck_id)
);

create policy deck_views_insert_own
on public.deck_views for insert to authenticated
with check (student_id = (select auth.uid()) and private.views_slide(deck_id, slide_no));
