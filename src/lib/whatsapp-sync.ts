import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { DESK_WHATSAPP, normalizeNgPhone } from "@/lib/listings";
import {
  publicCloudStatus,
  whatsappRuntime,
  WHATSAPP_WEBHOOK_CHALLENGE,
  WHATSAPP_WEBHOOK_PATH,
  type WhatsappCloudStatus,
} from "@/lib/whatsapp-config";

export type WhatsappConnection = {
  connected: boolean;
  connectedAt: string | null;
  inboxPhone: string;
  agentPhone: string;
  lastInboundAt: string | null;
};

export type WatchedGroup = {
  id: string;
  name: string;
  areaFocus: string;
  watching: boolean;
  lastSyncedAt: string | null;
  lastPostAt: string | null;
  listingCount: number;
};

export type InboxItem = {
  id: string;
  groupName: string;
  body: string;
  status: string;
  listingId: string | null;
  confidence: number | null;
  receivedAt: string;
};

export type IngestSummary = {
  action: "published" | "updated" | "ignored" | "duplicate";
  listingId: string | null;
  groupName: string;
  title: string | null;
  reason?: string;
};

async function ensureConnection() {
  const { ensureListingsSchema } = await import("@/lib/listing-schema");
  const sql = await getSql();
  await ensureListingsSchema();
  const runtime = whatsappRuntime();
  await sql`
    insert into whatsapp_connection (id, connected, inbox_phone, agent_phone)
    values (${"desk"}, ${false}, ${runtime.inboxPhone}, ${runtime.agentPhone})
    on conflict (id) do nothing
  `;
  // Env wins only while the desk still has the placeholder number.
  if (runtime.inboxPhone && runtime.inboxPhone !== DESK_WHATSAPP) {
    await sql`
      update whatsapp_connection
      set inbox_phone = ${runtime.inboxPhone}
      where id = ${"desk"} and inbox_phone = ${DESK_WHATSAPP}
    `;
  }
  if (runtime.agentPhone && runtime.agentPhone !== DESK_WHATSAPP) {
    await sql`
      update whatsapp_connection
      set agent_phone = ${runtime.agentPhone}
      where id = ${"desk"} and agent_phone = ${DESK_WHATSAPP}
    `;
  }
  await sql`
    update listing_groups
    set watching = false
    where exists (
      select 1 from whatsapp_connection
      where id = ${"desk"} and connected = false
    )
  `;
}

const toIso = (v: string | Date | null | undefined) =>
  !v ? null : typeof v === "string" ? v : v.toISOString();

export const getWhatsappStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { bootstrapListings } = await import("@/lib/listing-api");
  await bootstrapListings();
  await ensureConnection();
  const sql = await getSql();
  const conn = await sql<{
    connected: boolean;
    connected_at: string | Date | null;
    inbox_phone: string;
    agent_phone: string | null;
    last_inbound_at: string | Date | null;
  }>`select connected, connected_at, inbox_phone, agent_phone, last_inbound_at from whatsapp_connection where id = ${"desk"}`;
  const row = conn[0];
  const runtime = whatsappRuntime();
  const groups = await sql<{
    id: string;
    name: string;
    area_focus: string;
    watching: boolean;
    last_synced_at: string | Date | null;
    last_post_at: string | Date | null;
    listing_count: number;
  }>`
    select g.id, g.name, g.area_focus, g.watching,
      g.last_synced_at::text as last_synced_at,
      g.last_post_at::text as last_post_at,
      (select count(*)::int from listings l where l.group_id = g.id and l.status = 'available') as listing_count
    from listing_groups g
    order by g.name
  `;
  const inbox = await sql<{
    id: string;
    group_name: string;
    body: string;
    status: string;
    listing_id: string | null;
    confidence: number | null;
    received_at: string | Date;
  }>`
    select id, group_name, body, status, listing_id, confidence, received_at::text as received_at
    from whatsapp_inbox
    order by received_at desc
    limit 20
  `;

  return {
    connection: {
      connected: Boolean(row?.connected),
      connectedAt: toIso(row?.connected_at ?? null),
      inboxPhone: row?.inbox_phone ?? runtime.inboxPhone,
      agentPhone: row?.agent_phone || row?.inbox_phone || runtime.agentPhone,
      lastInboundAt: toIso(row?.last_inbound_at ?? null),
    } satisfies WhatsappConnection,
    cloud: publicCloudStatus() satisfies WhatsappCloudStatus,
    groups: groups.map(
      (g): WatchedGroup => ({
        id: g.id,
        name: g.name,
        areaFocus: g.area_focus,
        watching: Boolean(g.watching),
        lastSyncedAt: toIso(g.last_synced_at),
        lastPostAt: toIso(g.last_post_at),
        listingCount: Number(g.listing_count),
      }),
    ),
    inbox: inbox.map(
      (i): InboxItem => ({
        id: i.id,
        groupName: i.group_name,
        body: i.body,
        status: i.status,
        listingId: i.listing_id,
        confidence: i.confidence === null ? null : Number(i.confidence),
        receivedAt: typeof i.received_at === "string" ? i.received_at : i.received_at.toISOString(),
      }),
    ),
  };
});

export const getDeskPhones = createServerFn({ method: "POST" }).handler(async () => {
  await ensureConnection();
  const sql = await getSql();
  const rows = await sql<{ inbox_phone: string; agent_phone: string | null }>`
    select inbox_phone, agent_phone from whatsapp_connection where id = ${"desk"}
  `;
  const runtime = whatsappRuntime();
  return {
    inboxPhone: rows[0]?.inbox_phone || runtime.inboxPhone,
    agentPhone: rows[0]?.agent_phone || rows[0]?.inbox_phone || runtime.agentPhone,
  };
});

export const saveWhatsappNumbers = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        inboxPhone: z.string().min(10).max(24),
        agentPhone: z.string().min(10).max(24),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const inbox = normalizeNgPhone(data.inboxPhone);
    const agent = normalizeNgPhone(data.agentPhone);
    if (!inbox) throw new Error("Inbox number looks wrong. Use a Nigerian mobile, e.g. 0803 000 0000.");
    if (!agent) throw new Error("Your WhatsApp number looks wrong. Use a Nigerian mobile, e.g. 0803 000 0000.");
    await ensureConnection();
    const sql = await getSql();
    await sql`
      update whatsapp_connection
      set inbox_phone = ${inbox}, agent_phone = ${agent}
      where id = ${"desk"}
    `;
    return { ok: true as const, inboxPhone: inbox, agentPhone: agent };
  });

export const connectWhatsappInbox = createServerFn({ method: "POST" }).handler(async () => {
  const { bootstrapListings } = await import("@/lib/listing-api");
  await bootstrapListings();
  await ensureConnection();
  const sql = await getSql();
  const now = new Date().toISOString();
  await sql`
    update whatsapp_connection
    set connected = true, connected_at = ${now}
    where id = ${"desk"}
  `;
  const watched = await sql<{ n: number }>`select count(*)::int as n from listing_groups where watching = true`;
  if ((watched[0]?.n ?? 0) === 0) {
    await sql`update listing_groups set watching = true`;
  }
  const { pullWatchedGroupPosts } = await import("@/lib/whatsapp-ingest");
  const pulled = await pullWatchedGroupPosts();
  return { ok: true as const, pulled };
});

export const testWhatsappWebhook = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ origin: z.string().max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const runtime = whatsappRuntime();
    const origin = (data.origin ?? runtime.publicUrl).replace(/\/$/, "");
    const webhookUrl = origin ? `${origin}${WHATSAPP_WEBHOOK_PATH}` : runtime.webhookUrl;
    if (!webhookUrl) {
      return {
        ok: false as const,
        reason: "Open this desk on your live Letlist URL so Meta has an HTTPS callback.",
        webhookUrl: "",
      };
    }
    const url = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(runtime.verifyToken)}&hub.challenge=${WHATSAPP_WEBHOOK_CHALLENGE}`;
    try {
      const res = await fetch(url, { method: "GET" });
      const body = (await res.text()).trim();
      const ok = res.ok && body === WHATSAPP_WEBHOOK_CHALLENGE;
      return {
        ok,
        status: res.status,
        webhookUrl,
        reason: ok
          ? "Handshake passed. Paste this callback into Meta and tap Verify and save."
          : `Webhook answered ${res.status}. Check the verify token matches letlist-whatsapp.`,
      };
    } catch {
      return {
        ok: false as const,
        webhookUrl,
        reason: "Could not reach the webhook from here. Try Test handshake in the browser on this page.",
      };
    }
  });

export const setGroupWatching = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1), watching: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`update listing_groups set watching = ${data.watching} where id = ${data.id}`;
    return { ok: true as const };
  });

export const addWatchedGroup = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ name: z.string().min(3).max(80), areaFocus: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const id = `g-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
    await sql`
      insert into listing_groups (id, name, area_focus, description, watching)
      values (
        ${id},
        ${data.name.trim()},
        ${data.areaFocus?.trim() || "Lagos"},
        ${"Added from the WhatsApp desk."},
        ${true}
      )
      on conflict (id) do update set watching = true, name = excluded.name
    `;
    return { ok: true as const, id };
  });

export const syncWatchedGroups = createServerFn({ method: "POST" }).handler(async () => {
  await ensureConnection();
  const sql = await getSql();
  const conn = await sql<{ connected: boolean }>`select connected from whatsapp_connection where id = ${"desk"}`;
  if (!conn[0]?.connected) {
    throw new Error("Connect WhatsApp first.");
  }
  const { pullWatchedGroupPosts } = await import("@/lib/whatsapp-ingest");
  const pulled = await pullWatchedGroupPosts();
  return { pulled };
});

export const ingestForwardedPost = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        body: z.string().min(12).max(8000),
        groupName: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<IngestSummary> => {
    await ensureConnection();
    const sql = await getSql();
    const conn = await sql<{ connected: boolean }>`select connected from whatsapp_connection where id = ${"desk"}`;
    if (!conn[0]?.connected) {
      throw new Error("Connect WhatsApp first.");
    }
    const { ingestWhatsappText } = await import("@/lib/whatsapp-ingest");
    return ingestWhatsappText({
      body: data.body,
      groupName: data.groupName?.trim() || undefined,
    });
  });
