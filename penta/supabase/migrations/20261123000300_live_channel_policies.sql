create function private.live_topic_deck(topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when topic ~ '^live:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substring(topic from 6)::uuid
  end;
$$;

revoke execute on function private.live_topic_deck(text) from public, anon;
grant execute on function private.live_topic_deck(text) to authenticated, service_role;

create policy live_look_for_teacher_or_reader
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (
    private.teaches_deck(private.live_topic_deck((select realtime.topic())))
    or private.reads_deck(private.live_topic_deck((select realtime.topic())))
  )
);

create policy live_presence_read_by_teacher
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and private.teaches_deck(private.live_topic_deck((select realtime.topic())))
);

create policy live_presence_track_by_teacher_or_reader
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and (
    private.teaches_deck(private.live_topic_deck((select realtime.topic())))
    or private.reads_deck(private.live_topic_deck((select realtime.topic())))
  )
);
