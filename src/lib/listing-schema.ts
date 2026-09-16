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
}
