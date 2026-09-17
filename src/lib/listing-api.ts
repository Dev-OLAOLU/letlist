import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import {
  parseAmenities,
  type Listing,
  type ListingGroup,
  type PropertyType,
  type SearchFilters,
} from "@/lib/listings";
import { SEED_GROUPS, SEED_LISTINGS } from "@/lib/seed";
import { ensureListingsSchema } from "@/lib/listing-schema";

const propertyTypeSchema = z.enum([
  "self-contain",
  "mini-flat",
  "studio",
  "flat",
  "duplex",
  "terrace",
  "bungalow",
  "penthouse",
]);

const searchSchema = z.object({
  q: z.string().optional(),
  area: z.string().optional(),
  bedrooms: z.union([z.number(), z.literal("sc"), z.literal("4plus")]).optional(),
  maxRent: z.number().optional(),
  minRent: z.number().optional(),
  propertyType: propertyTypeSchema.optional(),
  groupId: z.string().optional(),
  status: z.enum(["available", "taken"]).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc"]).optional(),
});

const publishSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().min(3).max(160),
  area: z.string().min(1),
  neighborhood: z.string().max(80).optional().default(""),
  propertyType: propertyTypeSchema,
  bedrooms: z.number().int().min(0).max(12),
  bathrooms: z.number().int().min(1).max(12),
  rentAnnual: z.number().int().min(50_000).max(500_000_000),
  agencyFee: z.number().int().nullable(),
  legalFee: z.number().int().nullable(),
  serviceCharge: z.number().int().nullable(),
  cautionFee: z.number().int().nullable(),
  description: z.string().min(8).max(4000),
  amenities: z.array(z.string()).max(30),
  imageKey: z.string().min(1),
  rawPost: z.string().max(8000).nullable(),
});

type ListingRow = {
  id: string;
  group_id: string;
  group_name: string;
  title: string;
  area: string;
  neighborhood: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  rent_annual: number;
  agency_fee: number | null;
  legal_fee: number | null;
  service_charge: number | null;
  caution_fee: number | null;
  description: string;
  amenities: string;
  image_key: string;
  status: string;
  raw_post: string | null;
  posted_at: string | Date;
};

function toListing(row: ListingRow, media: Listing["media"] = []): Listing {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    title: row.title,
    area: row.area,
    neighborhood: row.neighborhood,
    propertyType: row.property_type as PropertyType,
    bedrooms: Number(row.bedrooms),
    bathrooms: Number(row.bathrooms),
    rentAnnual: Number(row.rent_annual),
    agencyFee: row.agency_fee === null ? null : Number(row.agency_fee),
    legalFee: row.legal_fee === null ? null : Number(row.legal_fee),
    serviceCharge: row.service_charge === null ? null : Number(row.service_charge),
    cautionFee: row.caution_fee === null ? null : Number(row.caution_fee),
    description: row.description,
    amenities: parseAmenities(row.amenities),
    imageKey: row.image_key,
    media,
    status: row.status === "taken" ? "taken" : "available",
    rawPost: row.raw_post,
    postedAt: typeof row.posted_at === "string" ? row.posted_at : row.posted_at.toISOString(),
  };
}

async function withMedia(listings: Listing[]): Promise<Listing[]> {
  if (listings.length === 0) return listings;
  const { mediaForListings } = await import("@/lib/whatsapp-media");
  const map = await mediaForListings(listings.map((l) => l.id));
  return listings.map((listing) => ({
    ...listing,
    media: map.get(listing.id) ?? [],
  }));
}

const LISTING_SELECT = `
  l.id, l.group_id, g.name as group_name, l.title, l.area, l.neighborhood,
  l.property_type, l.bedrooms, l.bathrooms, l.rent_annual, l.agency_fee,
  l.legal_fee, l.service_charge, l.caution_fee, l.description, l.amenities,
  l.image_key, l.status, l.raw_post, l.posted_at::text as posted_at
`;

async function seedIfEmpty() {
  const sql = await getSql();
  await ensureListingsSchema();
  const countRows = await sql<{ n: number }>`select count(*)::int as n from listing_groups`;
  if ((countRows[0]?.n ?? 0) > 0) return;

  for (const group of SEED_GROUPS) {
    await sql`
      insert into listing_groups (id, name, area_focus, description, watching)
      values (${group.id}, ${group.name}, ${group.areaFocus}, ${group.description}, ${false})
    `;
  }

  for (const listing of SEED_LISTINGS) {
    const postedAt = new Date(Date.now() - listing.hoursAgo * 60 * 60 * 1000).toISOString();
    await sql`
      insert into listings (
        id, group_id, title, area, neighborhood, property_type, bedrooms, bathrooms,
        rent_annual, agency_fee, legal_fee, service_charge, caution_fee, description,
        amenities, image_key, status, raw_post, posted_at
      ) values (
        ${listing.id}, ${listing.groupId}, ${listing.title}, ${listing.area},
        ${listing.neighborhood}, ${listing.propertyType}, ${listing.bedrooms},
        ${listing.bathrooms}, ${listing.rentAnnual}, ${listing.agencyFee},
        ${listing.legalFee}, ${listing.serviceCharge}, ${listing.cautionFee},
        ${listing.description}, ${JSON.stringify(listing.amenities)},
        ${listing.imageKey}, ${"available"}, ${listing.rawPost}, ${postedAt}
      )
    `;
  }
}

export const bootstrapListings = createServerFn({ method: "POST" }).handler(async () => {
  await seedIfEmpty();
  return { ok: true as const };
});

export const searchListings = createServerFn({ method: "POST" })
  .validator((d: unknown) => searchSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<{ listings: Listing[]; total: number }> => {
    await seedIfEmpty();
    const sql = await getSql();
    const filters = data as SearchFilters;

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };

    add("l.status = ?", filters.status ?? "available");

    if (filters.area) add("l.area = ?", filters.area);
    if (filters.groupId) add("l.group_id = ?", filters.groupId);
    if (filters.propertyType) add("l.property_type = ?", filters.propertyType);
    if (typeof filters.maxRent === "number") add("l.rent_annual <= ?", filters.maxRent);
    if (typeof filters.minRent === "number") add("l.rent_annual >= ?", filters.minRent);

    if (filters.bedrooms === "sc") {
      where.push("(l.property_type in ('self-contain', 'studio', 'mini-flat') and l.bedrooms <= 1)");
    } else if (filters.bedrooms === "4plus") {
      where.push("l.bedrooms >= 4");
    } else if (typeof filters.bedrooms === "number") {
      add("l.bedrooms = ?", filters.bedrooms);
    }

    if (filters.q && filters.q.trim()) {
      const q = `%${filters.q.trim().toLowerCase()}%`;
      params.push(q, q, q, q, q);
      const a = params.length - 4;
      where.push(
        `(lower(l.title) like $${a} or lower(l.area) like $${a + 1} or lower(l.neighborhood) like $${a + 2} or lower(l.description) like $${a + 3} or lower(g.name) like $${a + 4})`,
      );
    }

    const order =
      filters.sort === "price-asc"
        ? "l.rent_annual asc, l.posted_at desc"
        : filters.sort === "price-desc"
          ? "l.rent_annual desc, l.posted_at desc"
          : "l.posted_at desc";

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";
    const rows = await sql.query<ListingRow>(
      `select ${LISTING_SELECT} from listings l join listing_groups g on g.id = l.group_id ${whereSql} order by ${order}`,
      params,
    );
    const listings = await withMedia(rows.map((row) => toListing(row)));
    return { listings, total: listings.length };
  });

export const getListing = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<Listing | null> => {
    await seedIfEmpty();
    const sql = await getSql();
    const rows = await sql.query<ListingRow>(
      `select ${LISTING_SELECT} from listings l join listing_groups g on g.id = l.group_id where l.id = $1`,
      [data.id],
    );
    const listing = rows[0] ? toListing(rows[0]) : null;
    if (!listing) return null;
    const [hydrated] = await withMedia([listing]);
    return hydrated ?? listing;
  });

export const listGroups = createServerFn({ method: "POST" }).handler(async (): Promise<ListingGroup[]> => {
  await seedIfEmpty();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    area_focus: string;
    description: string;
    listing_count: number;
    watching: boolean;
    last_synced_at: string | Date | null;
  }>`
    select g.id, g.name, g.area_focus, g.description, g.watching,
      g.last_synced_at::text as last_synced_at,
      (select count(*)::int from listings l where l.group_id = g.id and l.status = 'available') as listing_count
    from listing_groups g
    order by g.name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    areaFocus: r.area_focus,
    description: r.description,
    listingCount: Number(r.listing_count),
    watching: Boolean(r.watching),
    lastSyncedAt: r.last_synced_at
      ? typeof r.last_synced_at === "string"
        ? r.last_synced_at
        : r.last_synced_at.toISOString()
      : null,
  }));
});

export const areaStats = createServerFn({ method: "POST" }).handler(async () => {
  await seedIfEmpty();
  const sql = await getSql();
  const rows = await sql<{ area: string; n: number; min_rent: number }>`
    select area, count(*)::int as n, min(rent_annual)::int as min_rent
    from listings
    where status = 'available'
    group by area
    order by n desc, area
  `;
  return rows.map((r) => ({ area: r.area, count: Number(r.n), minRent: Number(r.min_rent) }));
});

export const similarListings = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<Listing[]> => {
    await seedIfEmpty();
    const sql = await getSql();
    const current = await sql.query<ListingRow>(
      `select ${LISTING_SELECT} from listings l join listing_groups g on g.id = l.group_id where l.id = $1`,
      [data.id],
    );
    const listing = current[0];
    if (!listing) return [];
    const rows = await sql.query<ListingRow>(
      `select ${LISTING_SELECT}
       from listings l join listing_groups g on g.id = l.group_id
       where l.id <> $1 and l.status = 'available'
         and (l.area = $2 or l.bedrooms = $3)
       order by case when l.area = $2 then 0 else 1 end, abs(l.rent_annual - $4), l.posted_at desc
       limit 4`,
      [data.id, listing.area, listing.bedrooms, listing.rent_annual],
    );
    return withMedia(rows.map((row) => toListing(row)));
  });

const IMAGE_KEYS = [
  "lekki-living",
  "ikoyi-bedroom",
  "ikeja-miniflat",
  "yaba-selfcontain",
  "ajah-duplex",
  "vi-living",
  "kitchen",
  "magodo-estate",
  "surulere-living",
  "ensuite",
];

export const publishListing = createServerFn({ method: "POST" })
  .validator((d: unknown) => publishSchema.parse(d))
  .handler(async ({ data }): Promise<Listing> => {
    await seedIfEmpty();
    const sql = await getSql();
    const groups = await sql<{ id: string }>`select id from listing_groups where id = ${data.groupId}`;
    if (!groups[0]) throw new Error("Unknown WhatsApp group");

    const id = `lst-${Date.now().toString(36)}`;
    const imageKey = IMAGE_KEYS.includes(data.imageKey) ? data.imageKey : "lekki-living";
    await sql`
      insert into listings (
        id, group_id, title, area, neighborhood, property_type, bedrooms, bathrooms,
        rent_annual, agency_fee, legal_fee, service_charge, caution_fee, description,
        amenities, image_key, status, raw_post, posted_at
      ) values (
        ${id}, ${data.groupId}, ${data.title}, ${data.area}, ${data.neighborhood},
        ${data.propertyType}, ${data.bedrooms}, ${data.bathrooms}, ${data.rentAnnual},
        ${data.agencyFee}, ${data.legalFee}, ${data.serviceCharge}, ${data.cautionFee},
        ${data.description}, ${JSON.stringify(data.amenities)}, ${imageKey},
        ${"available"}, ${data.rawPost}, ${new Date().toISOString()}
      )
    `;
    const created = await getListing({ data: { id } });
    if (!created) throw new Error("Failed to publish listing");
    return created;
  });

export const markListingTaken = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`update listings set status = 'taken' where id = ${data.id} and status = 'available'`;
    return { ok: true as const };
  });
