import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { LISTING_IMAGE_KEYS } from "@/lib/listings";
import { extractGroupName, parseWhatsappPost, type ParsedListing } from "@/lib/whatsapp-parser";
import { LIVE_GROUP_POSTS } from "@/lib/whatsapp-live-posts";

export type IngestResult = {
  action: "published" | "updated" | "ignored" | "duplicate";
  listingId: string | null;
  groupName: string;
  title: string | null;
  reason?: string;
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

export async function ingestWhatsappText(input: {
  body: string;
  groupName?: string;
  waMessageId?: string;
}): Promise<IngestResult> {
  const sql = await getSql();
  const body = input.body.trim();
  if (body.length < 12) {
    return { action: "ignored", listingId: null, groupName: input.groupName ?? "Unknown", title: null, reason: "Too short" };
  }

  const waMessageId = input.waMessageId ?? `wamid.local.${createHash("sha256").update(body).digest("hex").slice(0, 16)}`;
  const existingMsg = await sql<{ listing_id: string | null; status: string }>`
    select listing_id, status from whatsapp_inbox where wa_message_id = ${waMessageId} limit 1
  `;
  if (existingMsg[0]) {
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
    return { action: "ignored", listingId: null, groupName: group.name, title: parsed.title, reason: "Group is not watched" };
  }

  const canPublish = Boolean(parsed.area && parsed.rentAnnual && parsed.confidence >= 0.55);
  if (!canPublish || !parsed.rentAnnual) {
    await sql`
      insert into whatsapp_inbox (id, wa_message_id, group_id, group_name, body, status, confidence)
      values (${inboxId}, ${waMessageId}, ${group.id}, ${group.name}, ${body}, ${"ignored"}, ${parsed.confidence})
    `;
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
    return { action: "updated", listingId: existingId, groupName: group.name, title: parsed.title };
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
  return { action: "published", listingId, groupName: group.name, title: parsed.title };
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

export function parseCloudApiPayload(payload: unknown): { body: string; groupName?: string; waMessageId?: string }[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;

  if (typeof root.text === "string" && root.text.trim()) {
    return [
      {
        body: root.text,
        groupName: typeof root.group === "string" ? root.group : typeof root.groupName === "string" ? root.groupName : undefined,
        waMessageId: typeof root.id === "string" ? root.id : undefined,
      },
    ];
  }

  const out: { body: string; groupName?: string; waMessageId?: string }[] = [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        const msg = message as {
          id?: string;
          type?: string;
          group_id?: string;
          from?: string;
          text?: { body?: string };
          image?: { caption?: string };
          document?: { caption?: string };
          video?: { caption?: string };
        };
        const body =
          msg.text?.body?.trim() ||
          msg.image?.caption?.trim() ||
          msg.document?.caption?.trim() ||
          msg.video?.caption?.trim();
        if (!body) continue;
        out.push({
          body,
          groupName: typeof msg.group_id === "string" ? msg.group_id : undefined,
          waMessageId: typeof msg.id === "string" ? msg.id : undefined,
        });
      }
    }
  }
  return out;
}

