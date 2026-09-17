import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { LISTING_IMAGE_KEYS } from "@/lib/listings";
import { extractGroupName, parseWhatsappPost, type ParsedListing } from "@/lib/whatsapp-parser";
import { LIVE_GROUP_POSTS } from "@/lib/whatsapp-live-posts";
import {
  ingestCloudAndInlineMedia,
  lastListingForSender,
  stashCloudMedia,
  type CloudMediaRef,
  type InlineMedia,
} from "@/lib/whatsapp-media";
import { kindFromMime } from "@/lib/whatsapp-media-kind";

export type IngestResult = {
  action: "published" | "updated" | "ignored" | "duplicate";
  listingId: string | null;
  groupName: string;
  title: string | null;
  reason?: string;
  mediaCount?: number;
};

export type InboundWhatsapp = {
  body: string;
  groupName?: string;
  waMessageId?: string;
  from?: string;
  media?: CloudMediaRef[];
  inlineMedia?: InlineMedia[];
};

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug || "group";
}

function fingerprint(groupId: string, parsed: ParsedListing): string {
  const place = (parsed.neighborhood || "").toLowerCase().replace(/\s+/g, " ").trim();
  const raw = `${groupId}|${parsed.area}|${place}|${parsed.bedrooms}|${parsed.propertyType}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function imageFor(parsed: ParsedListing): string {
  if (parsed.propertyType === "duplex" || parsed.propertyType === "terrace" || parsed.propertyType === "bungalow") {
    return "ajah-duplex";
  }
  if (parsed.propertyType === "self-contain" || parsed.propertyType === "studio") return "yaba-selfcontain";
  if (parsed.area === "Victoria Island" || parsed.area === "Ikoyi" || parsed.area === "Oniru") return "vi-living";
  if (parsed.area === "Ikeja" || parsed.area === "Maryland") return "ikeja-miniflat";
  if (parsed.area === "Magodo" || parsed.area === "Ogudu") return "magodo-estate";
  if (parsed.area === "Surulere" || parsed.area === "Gbagada") return "surulere-living";
  if (parsed.propertyType === "penthouse") return "ikoyi-bedroom";
  if (parsed.amenities.includes("Fitted kitchen")) return "kitchen";
  return LISTING_IMAGE_KEYS[0];
}

async function knownGroupNames(): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ name: string }>`select name from listing_groups`;
  return rows.map((r) => r.name);
}

async function resolveGroup(name: string): Promise<{
  id: string;
  name: string;
  watching: boolean;
}> {
  const sql = await getSql();
  const names = await knownGroupNames();
  const matched = extractGroupName(name, names) ?? name;
  const existing = await sql<{ id: string; name: string; watching: boolean }>`
    select id, name, watching from listing_groups
    where lower(name) = ${matched.toLowerCase()}
    limit 1
  `;
  if (existing[0]) return existing[0];

  const fuzzy = await sql<{ id: string; name: string; watching: boolean }>`
    select id, name, watching from listing_groups
    where lower(name) like ${"%" + matched.toLowerCase() + "%"}
       or ${matched.toLowerCase()} like '%' || lower(name) || '%'
    limit 1
  `;
  if (fuzzy[0]) return fuzzy[0];

  const id = `g-${slugify(matched)}-${Date.now().toString(36).slice(-4)}`;
  await sql`
    insert into listing_groups (id, name, area_focus, description, watching)
    values (
      ${id},
      ${matched.slice(0, 80)},
      ${"Lagos"},
      ${"Connected from WhatsApp."},
      ${true}
    )
  `;
  return { id, name: matched.slice(0, 80), watching: true };
}

async function findExistingListing(groupId: string, parsed: ParsedListing, hash: string): Promise<string | null> {
  const sql = await getSql();
  const byHash = await sql<{ id: string }>`
    select id from listings
    where source_hash = ${hash} and group_id = ${groupId}
    order by posted_at desc
    limit 1
  `;
  if (byHash[0]) return byHash[0].id;

  const place = (parsed.neighborhood || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (place) {
    const byPlace = await sql<{ id: string }>`
      select id from listings
      where group_id = ${groupId}
        and area = ${parsed.area}
        and bedrooms = ${parsed.bedrooms}
        and property_type = ${parsed.propertyType}
        and lower(trim(coalesce(neighborhood, ''))) = ${place}
      order by posted_at desc
      limit 1
    `;
    if (byPlace[0]) return byPlace[0].id;
    return null;
  }

  const byType = await sql<{ id: string }>`
    select id from listings
    where group_id = ${groupId}
      and area = ${parsed.area}
      and bedrooms = ${parsed.bedrooms}
      and property_type = ${parsed.propertyType}
    order by posted_at desc
    limit 1
  `;
  return byType[0]?.id ?? null;
}

function senderKey(from?: string): string | undefined {
  if (!from) return undefined;
  const digits = from.replace(/\D/g, "");
  if (digits.length >= 8) return digits;
  const key = from.trim().toLowerCase();
  return key || undefined;
}

export async function ingestWhatsappText(input: InboundWhatsapp): Promise<IngestResult> {
  const sql = await getSql();
  const body = (input.body ?? "").trim();
  const cloud = input.media ?? [];
  const inline = input.inlineMedia ?? [];
  const hasMedia = cloud.length + inline.length > 0;
  const sender = senderKey(input.from);

  if (body.length < 12 && hasMedia) {
    const recent = sender ? await lastListingForSender(sender) : null;
    if (recent) {
      const mediaCount = await ingestCloudAndInlineMedia({
        listingId: recent,
        sender,
        cloud,
        inline,
      });
      return {
        action: "updated",
        listingId: recent,
        groupName: input.groupName ?? "Unknown",
        title: null,
        reason: "Attached photos/videos to the last listing from this inbox.",
        mediaCount,
      };
    }
    const stashed = await stashCloudMedia({ sender, cloud, inline });
    return {
      action: "ignored",
      listingId: null,
      groupName: input.groupName ?? "Unknown",
      title: null,
      reason: stashed
        ? "Held photos/videos. Forward the listing caption next and they will attach."
        : "Photo/video with no listing text.",
      mediaCount: stashed,
    };
  }

  if (body.length < 12) {
    return { action: "ignored", listingId: null, groupName: input.groupName ?? "Unknown", title: null, reason: "Too short" };
  }

  const waMessageId = input.waMessageId ?? `wamid.local.${createHash("sha256").update(body).digest("hex").slice(0, 16)}`;
  const existingMsg = await sql<{ listing_id: string | null; status: string }>`
    select listing_id, status from whatsapp_inbox where wa_message_id = ${waMessageId} limit 1
  `;
  if (existingMsg[0]) {
    if (hasMedia && existingMsg[0].listing_id) {
      const mediaCount = await ingestCloudAndInlineMedia({
        listingId: existingMsg[0].listing_id,
        sender,
        cloud,
        inline,
      });
      return {
        action: "duplicate",
        listingId: existingMsg[0].listing_id,
        groupName: input.groupName ?? "Unknown",
        title: null,
        mediaCount,
      };
    }
    return {
      action: "duplicate",
      listingId: existingMsg[0].listing_id,
      groupName: input.groupName ?? "Unknown",
      title: null,
    };
  }

  const names = await knownGroupNames();
  const groupName =
    input.groupName?.trim() ||
    extractGroupName(body, names) ||
    "Unassigned forwards";
  const group = await resolveGroup(groupName);
  const parsed = parseWhatsappPost(body);
  const inboxId = `in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  if (!group.watching) {
    await sql`
      insert into whatsapp_inbox (id, wa_message_id, group_id, group_name, body, status, confidence)
      values (${inboxId}, ${waMessageId}, ${group.id}, ${group.name}, ${body}, ${"ignored"}, ${parsed.confidence})
    `;
    if (hasMedia) await stashCloudMedia({ sender, cloud, inline });
    return { action: "ignored", listingId: null, groupName: group.name, title: parsed.title, reason: "Group is not watched" };
  }

  const canPublish = Boolean(parsed.area && parsed.rentAnnual && parsed.confidence >= 0.55);
  if (!canPublish || !parsed.rentAnnual) {
    await sql`
      insert into whatsapp_inbox (id, wa_message_id, group_id, group_name, body, status, confidence)
      values (${inboxId}, ${waMessageId}, ${group.id}, ${group.name}, ${body}, ${"ignored"}, ${parsed.confidence})
    `;
    if (hasMedia) {
      const recent = sender ? await lastListingForSender(sender) : null;
      if (recent) {
        const mediaCount = await ingestCloudAndInlineMedia({ listingId: recent, sender, cloud, inline });
        return {
          action: "updated",
          listingId: recent,
          groupName: group.name,
          title: parsed.title,
          reason: "Caption was not a full listing; photos attached to the last unit from this inbox.",
          mediaCount,
        };
      }
      await stashCloudMedia({ sender, cloud, inline });
    }
    return { action: "ignored", listingId: null, groupName: group.name, title: parsed.title, reason: "Could not read a listing from that post" };
  }

  const hash = fingerprint(group.id, parsed);
  const existingId = await findExistingListing(group.id, parsed, hash);
  const now = new Date().toISOString();
  const fees = {
    agency: parsed.agencyFee,
    legal: parsed.legalFee,
    service: parsed.serviceCharge,
    caution: parsed.cautionFee,
  };

  const attach = async (listingId: string) =>
    ingestCloudAndInlineMedia({ listingId, sender: sender ?? "desk", cloud, inline });

  if (existingId) {
    await sql`
      update listings set
        title = ${parsed.title},
        neighborhood = coalesce(nullif(${parsed.neighborhood}, ''), neighborhood),
        rent_annual = ${parsed.rentAnnual},
        agency_fee = ${fees.agency},
        legal_fee = ${fees.legal},
        service_charge = ${fees.service},
        caution_fee = ${fees.caution},
        description = ${parsed.description},
        amenities = ${JSON.stringify(parsed.amenities)},
        raw_post = ${body},
        status = ${"available"},
        source_hash = ${hash},
        wa_message_id = ${waMessageId},
        posted_at = ${now}
      where id = ${existingId}
    `;
    await sql`
      insert into whatsapp_inbox (id, wa_message_id, group_id, group_name, body, status, listing_id, confidence)
      values (${inboxId}, ${waMessageId}, ${group.id}, ${group.name}, ${body}, ${"updated"}, ${existingId}, ${parsed.confidence})
    `;
    await sql`
      update listing_groups set last_synced_at = ${now}, last_post_at = ${now} where id = ${group.id}
    `;
    await sql`update whatsapp_connection set last_inbound_at = ${now} where id = ${"desk"}`;
    const mediaCount = await attach(existingId);
    return { action: "updated", listingId: existingId, groupName: group.name, title: parsed.title, mediaCount };
  }

  const listingId = `lst-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await sql`
    insert into listings (
      id, group_id, title, area, neighborhood, property_type, bedrooms, bathrooms,
      rent_annual, agency_fee, legal_fee, service_charge, caution_fee, description,
      amenities, image_key, status, raw_post, posted_at, source_hash, wa_message_id
    ) values (
      ${listingId}, ${group.id}, ${parsed.title}, ${parsed.area}, ${parsed.neighborhood},
      ${parsed.propertyType}, ${parsed.bedrooms}, ${parsed.bathrooms}, ${parsed.rentAnnual},
      ${fees.agency}, ${fees.legal}, ${fees.service}, ${fees.caution},
      ${parsed.description}, ${JSON.stringify(parsed.amenities)}, ${imageFor(parsed)},
      ${"available"}, ${body}, ${now}, ${hash}, ${waMessageId}
    )
  `;
  await sql`
    insert into whatsapp_inbox (id, wa_message_id, group_id, group_name, body, status, listing_id, confidence)
    values (${inboxId}, ${waMessageId}, ${group.id}, ${group.name}, ${body}, ${"published"}, ${listingId}, ${parsed.confidence})
  `;
  await sql`
    update listing_groups set last_synced_at = ${now}, last_post_at = ${now} where id = ${group.id}
  `;
  await sql`update whatsapp_connection set last_inbound_at = ${now} where id = ${"desk"}`;
  const mediaCount = await attach(listingId);
  return { action: "published", listingId, groupName: group.name, title: parsed.title, mediaCount };
}

export async function pullWatchedGroupPosts(): Promise<IngestResult[]> {
  const sql = await getSql();
  const watched = await sql<{ name: string }>`select name from listing_groups where watching = true`;
  const watchedNames = new Set(watched.map((w) => w.name.toLowerCase()));
  const results: IngestResult[] = [];
  for (const post of LIVE_GROUP_POSTS) {
    if (!watchedNames.has(post.groupName.toLowerCase())) continue;
    results.push(
      await ingestWhatsappText({
        body: post.body,
        groupName: post.groupName,
        waMessageId: post.waMessageId,
      }),
    );
  }
  return results;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mediaFrom(obj: unknown): CloudMediaRef | null {
  const rec = asRecord(obj);
  if (!rec) return null;
  const id = str(rec.id);
  if (!id || id.startsWith("wamid.")) return null;
  const mime = str(rec.mime_type) || str(rec.mime) || str(rec.mimeType);
  const kind = kindFromMime(mime);
  if (!kind) return null;
  return { waMediaId: id, mime, kind };
}

function captionOf(obj: unknown): string {
  const rec = asRecord(obj);
  return rec ? str(rec.caption) : "";
}

function messageBody(o: Record<string, unknown>): string {
  if (typeof o.text === "string") return o.text.trim();
  const text = asRecord(o.text);
  return (
    str(text?.body) ||
    captionOf(o.image) ||
    captionOf(o.video) ||
    captionOf(o.document) ||
    str(o.caption) ||
    str(o.body) ||
    ""
  );
}

function looksLikeMessage(o: Record<string, unknown>): boolean {
  const type = str(o.type).toLowerCase();
  if (type === "text" || type === "image" || type === "video" || type === "document") return true;
  if (asRecord(o.image) || asRecord(o.video)) return true;
  const doc = asRecord(o.document);
  if (doc && kindFromMime(str(doc.mime_type) || str(doc.mime))) return true;
  const text = asRecord(o.text);
  if (text && typeof text.body === "string") return true;
  if (typeof o.text === "string" && (str(o.from) || str(o.id) || type)) return true;
  return false;
}

function inboundFromObject(o: Record<string, unknown>, groupName?: string): InboundWhatsapp | null {
  const media = [mediaFrom(o.image), mediaFrom(o.video), mediaFrom(o.document)].filter(
    (m): m is CloudMediaRef => Boolean(m),
  );
  const body = messageBody(o);
  if (!body && media.length === 0) return null;
  const waMessageId = str(o.id) || str(o.message_id) || str(o.wa_message_id) || undefined;
  const from = str(o.from) || str(o.sender) || undefined;
  const group =
    str(o.group_name) ||
    str(o.groupName) ||
    str(o.group_id) ||
    groupName ||
    undefined;
  return {
    body,
    groupName: group,
    waMessageId,
    from,
    media,
  };
}

export function parseCloudApiPayload(payload: unknown): InboundWhatsapp[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const out: InboundWhatsapp[] = [];
  const seen = new Set<string>();

  const remember = (item: InboundWhatsapp | null) => {
    if (!item) return;
    const key =
      item.waMessageId ||
      `${item.body}::${(item.media ?? []).map((m) => m.waMediaId).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  if (typeof root.text === "string" || asRecord(root.image) || asRecord(root.video) || asRecord(root.document)) {
    remember(inboundFromObject(root));
  }

  const walk = (node: unknown, group?: string) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, group);
      return;
    }
    const o = asRecord(node);
    if (!o) return;
    const nextGroup =
      str(o.group_name) ||
      str(o.groupName) ||
      (typeof o.subject === "string" ? o.subject : "") ||
      group;
    if (looksLikeMessage(o)) remember(inboundFromObject(o, nextGroup || undefined));
    for (const [key, value] of Object.entries(o)) {
      if (key === "error" || key === "paging" || key === "contacts" || key === "metadata") continue;
      if (value && typeof value === "object") walk(value, nextGroup || undefined);
    }
  };

  walk(root);
  return out;
}
