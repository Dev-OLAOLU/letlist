create table if not exists listing_media (
  id text primary key,
  listing_id text,
  sender text,
  wa_media_id text,
  kind text not null,
  mime text not null,
  byte_size integer not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

create unique index if not exists listing_media_wa_idx
  on listing_media (wa_media_id)
  where wa_media_id is not null;

create index if not exists listing_media_listing_idx
  on listing_media (listing_id, created_at);

create index if not exists listing_media_sender_idx
  on listing_media (sender, created_at desc);
