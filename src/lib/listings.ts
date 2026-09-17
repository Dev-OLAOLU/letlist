export const DESK_WHATSAPP = "2348098765432";
export const APP_NAME = "Letlist";

export type PropertyType =
  | "self-contain"
  | "mini-flat"
  | "studio"
  | "flat"
  | "duplex"
  | "terrace"
  | "bungalow"
  | "penthouse";

export type ListingStatus = "available" | "taken";

export type ListingGroup = {
  id: string;
  name: string;
  areaFocus: string;
  description: string;
  listingCount: number;
  watching: boolean;
  lastSyncedAt: string | null;
};

export type ListingMedia = {
  id: string;
  kind: "image" | "video";
  mime: string;
};

export type Listing = {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  area: string;
  neighborhood: string;
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  rentAnnual: number;
  agencyFee: number | null;
  legalFee: number | null;
  serviceCharge: number | null;
  cautionFee: number | null;
  description: string;
  amenities: string[];
  imageKey: string;
  media: ListingMedia[];
  status: ListingStatus;
  rawPost: string | null;
  postedAt: string;
};

export type SearchFilters = {
  q?: string;
  area?: string;
  bedrooms?: number | "sc" | "4plus";
  maxRent?: number;
  minRent?: number;
  propertyType?: PropertyType;
  groupId?: string;
  status?: ListingStatus;
  sort?: "newest" | "price-asc" | "price-desc";
};

export const AREAS = [
  "Lekki",
  "Victoria Island",
  "Ikoyi",
  "Oniru",
  "Ajah",
  "Sangotedo",
  "Ikeja",
  "Magodo",
  "Maryland",
  "Gbagada",
  "Yaba",
  "Surulere",
  "Ogudu",
  "Ketu",
] as const;

export type Area = (typeof AREAS)[number];

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "self-contain", label: "Self contain" },
  { value: "studio", label: "Studio" },
  { value: "mini-flat", label: "Mini flat" },
  { value: "flat", label: "Flat" },
  { value: "duplex", label: "Duplex" },
  { value: "terrace", label: "Terrace" },
  { value: "bungalow", label: "Bungalow" },
  { value: "penthouse", label: "Penthouse" },
];

export const LISTING_IMAGE_KEYS = [
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
] as const;

export const BUDGETS: { label: string; min?: number; max?: number }[] = [
  { label: "Under ₦1m", max: 1_000_000 },
  { label: "₦1–2.5m", min: 1_000_000, max: 2_500_000 },
  { label: "₦2.5–5m", min: 2_500_000, max: 5_000_000 },
  { label: "₦5–10m", min: 5_000_000, max: 10_000_000 },
  { label: "₦10m+", min: 10_000_000 },
];

export function listingImageSrc(imageKey: string): string {
  if (imageKey.startsWith("/")) return imageKey;
  if (imageKey.startsWith("med-")) return `/api/media/${imageKey}`;
  return `/images/listings/${imageKey}.jpg`;
}

export function listingCoverSrc(listing: Pick<Listing, "imageKey" | "media">): string {
  const photo = listing.media?.find((m) => m.kind === "image");
  if (photo) return `/api/media/${photo.id}`;
  const video = listing.media?.find((m) => m.kind === "video");
  if (video) return `/api/media/${video.id}`;
  return listingImageSrc(listing.imageKey);
}

export function formatNaira(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const body = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, "");
    return `₦${body}m`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    const body = Number.isInteger(k) ? String(k) : k.toFixed(0);
    return `₦${body}k`;
  }
  return `₦${n.toLocaleString("en-NG")}`;
}

export function formatNairaFull(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function bedroomLabel(bedrooms: number, type: PropertyType): string {
  if (type === "self-contain") return "Self contain";
  if (type === "studio") return "Studio";
  if (type === "mini-flat" && bedrooms <= 1) return "Mini flat";
  if (bedrooms === 1) return "1 bedroom";
  return `${bedrooms} bedroom`;
}

export function listingTitle(
  listing: Pick<Listing, "bedrooms" | "propertyType" | "neighborhood" | "area">,
): string {
  const kind = bedroomLabel(listing.bedrooms, listing.propertyType);
  const place = listing.neighborhood || listing.area;
  return `${kind} · ${place}`;
}

export function whatsappHref(listing: Listing, phone: string = DESK_WHATSAPP): string {
  const text = [
    `Hi, I saw this listing on Letlist and I want to inspect.`,
    ``,
    `${listingTitle(listing)}`,
    `${listing.area}${listing.neighborhood ? ` · ${listing.neighborhood}` : ""}`,
    `Rent ${formatNairaFull(listing.rentAnnual)} / year`,
    `Ref: ${listing.id}`,
  ].join("\n");
  const digits = (phone || DESK_WHATSAPP).replace(/\D/g, "") || DESK_WHATSAPP;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function searchShareText(filters: SearchFilters, count: number): string {
  const bits: string[] = [];
  if (filters.bedrooms === "sc") bits.push("self contain / studio");
  else if (filters.bedrooms === "4plus") bits.push("4+ bedroom");
  else if (typeof filters.bedrooms === "number") bits.push(`${filters.bedrooms} bedroom`);
  if (filters.area) bits.push(`in ${filters.area}`);
  if (filters.maxRent) bits.push(`under ${formatNaira(filters.maxRent)}`);
  const what = bits.length ? bits.join(" ") : "available apartments";
  return `Here are ${count} ${what} on Letlist. Take a look and tell me which ones to inspect.`;
}

export function formatInboxPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `0${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return e164.startsWith("+") ? e164 : `+${digits}`;
}

/** Nigerian mobile → 234XXXXXXXXXX. Null if it cannot be a WhatsApp number. */
export function normalizeNgPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("234") && d.length === 13) return d;
  if (d.startsWith("0") && d.length === 11) return `234${d.slice(1)}`;
  if (d.length === 10 && /^[789]/.test(d)) return `234${d}`;
  return null;
}

export function isPlaceholderPhone(raw: string): boolean {
  return raw.replace(/\D/g, "") === DESK_WHATSAPP;
}

export function parseAmenities(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* ignore */
  }
  return [];
}
