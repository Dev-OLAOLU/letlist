import { getSql } from "@/lib/db";

/** Idempotent WhatsApp/listing columns so a long-lived PGLite process picks up later migrations. */
export async function ensureListingsSchema() {
  const sql = await getSql();
  await sql.query(`alter table listing_groups add column if not exists watching boolean not null default false`);
  await sql.query(`alter table listing_groups add column if not exists wa_group_id text`);
  await sql.query(`alter table listing_groups add column if not exists last_synced_at timestamptz`);
  await sql.query(`alter table listing_groups add column if not exists last_post_at timestamptz`);
  await sql.query(`alter table listings add column if not exists source_hash text`);
  await sql.query(`alter table listings add column if not exists wa_message_id text`);
  await sql.query(`
    create table if not exists whatsapp_connection (
      id text primary key,
      connected boolean not null default false,
      connected_at timestamptz,
      inbox_phone text not null default '2348098765432',
      agent_phone text not null default '2348098765432',
      last_inbound_at timestamptz
    )
  `);
  await sql.query(`alter table whatsapp_connection add column if not exists agent_phone text not null default '2348098765432'`);
  await sql.query(`alter table whatsapp_connection add column if not exists meta_phone_number_id text`);
  await sql.query(`alter table whatsapp_connection add column if not exists meta_verified_name text`);
  await sql.query(`alter table whatsapp_connection add column if not exists meta_display_phone text`);
  await sql.query(`alter table whatsapp_connection add column if not exists meta_waba_id text`);
  await sql.query(`alter table whatsapp_connection add column if not exists last_pull_at timestamptz`);
  await sql.query(`alter table whatsapp_connection add column if not exists meta_error text`);
  await sql.query(`
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
    )
  `);
  await sql.query(`create index if not exists listings_source_hash_idx on listings (source_hash)`);
  await sql.query(`create index if not exists whatsapp_inbox_received_idx on whatsapp_inbox (received_at desc)`);
  await sql.query(`create index if not exists whatsapp_inbox_status_idx on whatsapp_inbox (status)`);
  await sql.query(`
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
    )
  `);
  await sql.query(`create index if not exists listing_media_listing_idx on listing_media (listing_id, created_at)`);
  try {
    const idx = await sql.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'listing_media_wa_idx'`,
    );
    if (idx[0]?.indexdef && !/where/i.test(idx[0].indexdef)) {
      await sql.query(`drop index if exists listing_media_wa_idx`);
    }
  } catch {
    /* pg_indexes may be unavailable; create below is still idempotent */
  }
  await sql.query(
    `create unique index if not exists listing_media_wa_idx on listing_media (wa_media_id) where wa_media_id is not null`,
  );
  await sql.query(`
    create table if not exists whatsapp_media_context (
      sender text primary key,
      listing_id text not null,
      updated_at timestamptz not null default now()
    )
  `);
}
