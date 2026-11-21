insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'decks',
  'decks',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
);
