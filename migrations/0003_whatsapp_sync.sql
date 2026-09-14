alter table listing_groups add column if not exists watching boolean not null default true;
alter table listing_groups add column if not exists wa_group_id text;
alter table listing_groups add column if not exists last_synced_at timestamptz;
alter table listing_groups add column if not exists last_post_at timestamptz;

alter table listings add column if not exists source_hash text;
alter table listings add column if not exists wa_message_id text;

create unique index if not exists listings_wa_message_id_uidx
  on listings (wa_message_id)
  where wa_message_id is not null;

create index if not exists listings_source_hash_idx on listings (source_hash);

create table if not exists whatsapp_connection (
  id text primary key,
  connected boolean not null default false,
  connected_at timestamptz,
  inbox_phone text not null default '2348098765432',
  last_inbound_at timestamptz
);

insert into whatsapp_connection (id, connected, inbox_phone)
values ('desk', false, '2348098765432')
on conflict (id) do nothing;

create table if not exists whatsapp_inbox (
  id text primary key,
  wa_message_id text unique,
  group_id text,
  group_name text not null,
  body text not null,
  status text not null default 'queued',
  listing_id text,
  confidence real,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_inbox_received_idx on whatsapp_inbox (received_at desc);
create index if not exists whatsapp_inbox_status_idx on whatsapp_inbox (status);
