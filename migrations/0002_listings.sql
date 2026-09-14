create table if not exists listing_groups (
  id text primary key,
  name text not null,
  area_focus text not null,
  description text not null
);

create table if not exists listings (
  id text primary key,
  group_id text not null references listing_groups(id),
  title text not null,
  area text not null,
  neighborhood text not null,
  property_type text not null,
  bedrooms integer not null,
  bathrooms integer not null,
  rent_annual integer not null,
  agency_fee integer,
  legal_fee integer,
  service_charge integer,
  caution_fee integer,
  description text not null,
  amenities text not null default '[]',
  image_key text not null,
  status text not null default 'available',
  raw_post text,
  posted_at timestamptz not null default now()
);

create index if not exists listings_area_idx on listings (area);
create index if not exists listings_posted_idx on listings (posted_at desc);
create index if not exists listings_status_idx on listings (status);
create index if not exists listings_group_idx on listings (group_id);
create index if not exists listings_beds_idx on listings (bedrooms);
create index if not exists listings_rent_idx on listings (rent_annual);
