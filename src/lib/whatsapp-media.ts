import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import {
  IMAGE_MAX_BYTES,
  MEDIA_PER_LISTING,
  VIDEO_MAX_BYTES,
  kindFromMime,
  normalizeMime,
  type CloudMediaRef,
  type InlineMedia,
  type ListingMediaRef,
  type MediaKind,
} from "@/lib/whatsapp-media-kind";

export {
  IMAGE_MAX_BYTES,
  MEDIA_PER_LISTING,
  VIDEO_MAX_BYTES,
  kindFromMime,
  normalizeMime,
};
export type { CloudMediaRef, InlineMedia, ListingMediaRef, MediaKind };

export function mediaSrc(id: string): string {
  return `/api/media/${id}`;
}

function newId(): string {
  return `med-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asBytes(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value.startsWith("0x") ? value.slice(2) : "";
    if (hex && /^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
      return Uint8Array.from(Buffer.from(hex, "hex"));
    }
  }
  return null;
}

export async function downloadCloudMedia(waMediaId: string): Promise<InlineMedia | null> {
  const { resolvedWhatsappCreds } = await import("@/lib/whatsapp-secrets");
  const creds = resolvedWhatsappCreds();
  if (!creds.accessToken || !waMediaId) return null;
  const version = env("WHATSAPP_GRAPH_VERSION") ?? "v22.0";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${version}/${waMediaId}`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      signal: ac.signal,
    });
    const meta = (await metaRes.json().catch(() => null)) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
      error?: { message?: string };
    } | null;
    if (!metaRes.ok || !meta?.url) return null;
    const mime = meta.mime_type || "application/octet-stream";
    const kind = kindFromMime(mime);
    if (!kind) return null;
    const cap = kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (typeof meta.file_size === "number" && meta.file_size > cap) return null;
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      signal: ac.signal,
    });
    if (!binRes.ok) return null;
    const buf = new Uint8Array(await binRes.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > cap) return null;
    return { mime: normalizeMime(mime, kind), kind, bytes: buf };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveListingMedia(input: {
  listingId?: string | null;
  sender?: string | null;
  waMediaId?: string | null;
  mime: string;
  kind: MediaKind;
  bytes: Uint8Array;
}): Promise<string | null> {
  const sql = await getSql();
  const cap = input.kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > cap) return null;
  const mime = normalizeMime(input.mime, input.kind);
  const waMediaId = input.waMediaId?.trim() || null;

  if (waMediaId) {
    const existing = await sql<{ id: string; listing_id: string | null }>`
      select id, listing_id from listing_media where wa_media_id = ${waMediaId} limit 1
    `;
    if (existing[0]) {
      if (input.listingId && !existing[0].listing_id) {
        await sql`update listing_media set listing_id = ${input.listingId} where id = ${existing[0].id}`;
      }
      return existing[0].id;
    }
  }

  if (input.listingId) {
    const count = await sql<{ n: number }>`
      select count(*)::int as n from listing_media where listing_id = ${input.listingId}
    `;
    if ((count[0]?.n ?? 0) >= MEDIA_PER_LISTING) return null;
  }

  const id = newId();
  const payload = Buffer.from(input.bytes);
  await sql.query(
    `insert into listing_media (id, listing_id, sender, wa_media_id, kind, mime, byte_size, bytes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.listingId ?? null, input.sender ?? null, waMediaId, input.kind, mime, input.bytes.byteLength, payload],
  );
  return id;
}

export async function attachPendingMedia(sender: string, listingId: string): Promise<number> {
  if (!sender) return 0;
  const sql = await getSql();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const pending = await sql<{ id: string }>`
    select id from listing_media
    where sender = ${sender} and listing_id is null and created_at >= ${cutoff}
    order by created_at
    limit ${MEDIA_PER_LISTING}
  `;
  if (pending.length === 0) return 0;
  let attached = 0;
  for (const row of pending) {
    const count = await sql<{ n: number }>`
      select count(*)::int as n from listing_media where listing_id = ${listingId}
    `;
    if ((count[0]?.n ?? 0) >= MEDIA_PER_LISTING) break;
    await sql`update listing_media set listing_id = ${listingId} where id = ${row.id}`;
    attached += 1;
  }
  return attached;
}

export async function rememberSenderListing(sender: string, listingId: string): Promise<void> {
  if (!sender) return;
  const sql = await getSql();
  await sql.query(
    `create table if not exists whatsapp_media_context (
      sender text primary key,
      listing_id text not null,
      updated_at timestamptz not null default now()
    )`,
  );
  await sql`
    insert into whatsapp_media_context (sender, listing_id, updated_at)
    values (${sender}, ${listingId}, ${new Date().toISOString()})
    on conflict (sender) do update set listing_id = excluded.listing_id, updated_at = excluded.updated_at
  `;
}

export async function lastListingForSender(sender: string): Promise<string | null> {
  if (!sender) return null;
  const sql = await getSql();
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const rows = await sql<{ listing_id: string }>`
      select listing_id from whatsapp_media_context
      where sender = ${sender} and updated_at >= ${cutoff}
      limit 1
    `;
    return rows[0]?.listing_id ?? null;
  } catch {
    return null;
  }
}

export async function mediaForListings(listingIds: string[]): Promise<Map<string, ListingMediaRef[]>> {
  const map = new Map<string, ListingMediaRef[]>();
  if (listingIds.length === 0) return map;
  const sql = await getSql();
  const placeholders = listingIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await sql.query<{ id: string; listing_id: string; kind: string; mime: string }>(
    `select id, listing_id, kind, mime from listing_media
     where listing_id in (${placeholders})
     order by created_at`,
    listingIds,
  );
  for (const row of rows) {
    const kind: MediaKind = row.kind === "video" ? "video" : "image";
    const list = map.get(row.listing_id) ?? [];
    list.push({ id: row.id, kind, mime: row.mime });
    map.set(row.listing_id, list);
  }
  return map;
}

export async function readListingMedia(id: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const sql = await getSql();
  const rows = await sql.query<{ bytes: unknown; mime: string; listing_id: string | null }>(
    `select bytes, mime, listing_id from listing_media where id = $1 limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row || !row.listing_id) return null;
  const bytes = asBytes(row.bytes);
  if (!bytes) return null;
  return { bytes, mime: row.mime };
}

export async function ingestCloudAndInlineMedia(input: {
  listingId: string;
  sender?: string | null;
  cloud?: CloudMediaRef[];
  inline?: InlineMedia[];
}): Promise<number> {
  let saved = 0;
  for (const item of input.cloud ?? []) {
    const downloaded = await downloadCloudMedia(item.waMediaId);
    if (!downloaded) continue;
    const id = await saveListingMedia({
      listingId: input.listingId,
      sender: input.sender,
      waMediaId: item.waMediaId,
      mime: downloaded.mime,
      kind: downloaded.kind,
      bytes: downloaded.bytes,
    });
    if (id) saved += 1;
  }
  for (const item of input.inline ?? []) {
    const id = await saveListingMedia({
      listingId: input.listingId,
      sender: input.sender,
      mime: item.mime,
      kind: item.kind,
      bytes: item.bytes,
    });
    if (id) saved += 1;
  }
  if (input.sender) {
    saved += await attachPendingMedia(input.sender, input.listingId);
    await rememberSenderListing(input.sender, input.listingId);
  }
  return saved;
}

export async function stashCloudMedia(input: {
  sender?: string | null;
  cloud?: CloudMediaRef[];
  inline?: InlineMedia[];
}): Promise<number> {
  let saved = 0;
  for (const item of input.cloud ?? []) {
    const downloaded = await downloadCloudMedia(item.waMediaId);
    if (!downloaded) continue;
    const id = await saveListingMedia({
      listingId: null,
      sender: input.sender ?? "unknown",
      waMediaId: item.waMediaId,
      mime: downloaded.mime,
      kind: downloaded.kind,
      bytes: downloaded.bytes,
    });
    if (id) saved += 1;
  }
  for (const item of input.inline ?? []) {
    const id = await saveListingMedia({
      listingId: null,
      sender: input.sender ?? "unknown",
      mime: item.mime,
      kind: item.kind,
      bytes: item.bytes,
    });
    if (id) saved += 1;
  }
  return saved;
}
