create sequence private.live_revision;

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  current_slide integer not null,
  revision bigint not null default 0,
  started_at timestamptz not null default now(),
  active_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint live_sessions_slide_positive check (current_slide >= 1)
);

create unique index live_sessions_one_open_per_deck on public.live_sessions (deck_id) where ended_at is null;
create index live_sessions_deck_revision_idx on public.live_sessions (deck_id, revision desc);
create index live_sessions_teacher_id_idx on public.live_sessions (teacher_id);

alter table public.live_sessions enable row level security;

revoke all on public.live_sessions from anon, authenticated;
grant select on public.live_sessions to authenticated;

create policy live_sessions_select_teacher_or_reader
on public.live_sessions for select to authenticated
using (private.teaches_deck(deck_id) or private.reads_deck(deck_id));

create function private.stamp_live_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.revision := nextval('private.live_revision');
  return new;
end;
$$;

create trigger stamp_live_revision
before insert or update of current_slide, ended_at on public.live_sessions
for each row execute function private.stamp_live_revision();

create function private.announce_live_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('session_id', new.id, 'revision', new.revision, 'ended', new.ended_at is not null),
      'look',
      'live:' || new.deck_id::text,
      true
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

create trigger announce_live_change
after insert or update of current_slide, ended_at on public.live_sessions
for each row execute function private.announce_live_change();

revoke execute on function private.stamp_live_revision() from public, anon, authenticated;
revoke execute on function private.announce_live_change() from public, anon, authenticated;
