import type { PropertyType, SearchFilters } from "@/lib/listings";

export type SearchInput = {
  q?: string;
  area?: string;
  beds?: string;
  min?: string;
  max?: string;
  type?: string;
  group?: string;
  sort?: string;
};

export function parseSearch(search: Record<string, unknown>): SearchInput {
  const str = (key: string) => (typeof search[key] === "string" ? (search[key] as string) : undefined);
  return {
    q: str("q"),
    area: str("area"),
    beds: str("beds"),
    min: str("min"),
    max: str("max"),
    type: str("type"),
    group: str("group"),
    sort: str("sort"),
  };
}

export function toFilters(input: SearchInput): SearchFilters {
  const beds = input.beds;
  let bedrooms: SearchFilters["bedrooms"];
  if (beds === "sc") bedrooms = "sc";
  else if (beds === "4plus") bedrooms = "4plus";
  else if (beds && /^\d+$/.test(beds)) bedrooms = Number(beds);

  return {
    q: input.q || undefined,
    area: input.area || undefined,
    bedrooms,
    minRent: input.min ? Number(input.min) : undefined,
    maxRent: input.max ? Number(input.max) : undefined,
    propertyType: (input.type as PropertyType | undefined) || undefined,
    groupId: input.group || undefined,
    sort: input.sort === "price-asc" || input.sort === "price-desc" ? input.sort : "newest",
    status: "available",
  };
}

export function compactSearch(input: SearchInput): SearchInput {
  const out: SearchInput = {};
  if (input.q) out.q = input.q;
  if (input.area) out.area = input.area;
  if (input.beds) out.beds = input.beds;
  if (input.min) out.min = input.min;
  if (input.max) out.max = input.max;
  if (input.type) out.type = input.type;
  if (input.group) out.group = input.group;
  if (input.sort && input.sort !== "newest") out.sort = input.sort;
  return out;
}
