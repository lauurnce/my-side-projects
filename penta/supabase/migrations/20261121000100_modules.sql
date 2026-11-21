create table public.modules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint modules_title_clean check (title <> '' and private.is_clean_text(title, 120))
);

create index modules_class_position_idx on public.modules (class_id, position);

alter table public.modules enable row level security;

revoke all on public.modules from anon, authenticated;
grant select on public.modules to authenticated;
grant insert (class_id, title) on public.modules to authenticated;
grant update (title) on public.modules to authenticated;
grant delete on public.modules to authenticated;

create function private.place_new_module()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sibling_count integer;
  last_position integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.class_id::text, 1));

  select count(*), coalesce(max(position), 0) into sibling_count, last_position
  from public.modules
  where class_id = new.class_id;

  if sibling_count >= 30 then
    raise exception 'module_limit' using errcode = 'P0001';
  end if;

  new.position := last_position + 1;
  return new;
end;
$$;

create trigger place_new_module
before insert on public.modules
for each row execute function private.place_new_module();

revoke execute on function private.place_new_module() from public, anon, authenticated;
