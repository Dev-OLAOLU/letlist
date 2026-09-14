import {
  AREAS,
  type Area,
  type PropertyType,
} from "./listings";

export type ParsedListing = {
  title: string;
  area: Area | "";
  neighborhood: string;
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  rentAnnual: number | null;
  agencyFee: number | null;
  legalFee: number | null;
  serviceCharge: number | null;
  cautionFee: number | null;
  description: string;
  amenities: string[];
  confidence: number;
};

const AREA_ALIASES: { alias: string; area: Area; neighborhood?: string }[] = [
  { alias: "lekki phase 1", area: "Lekki", neighborhood: "Phase 1" },
  { alias: "lekki phase 2", area: "Lekki", neighborhood: "Phase 2" },
  { alias: "lekki ph1", area: "Lekki", neighborhood: "Phase 1" },
  { alias: "lekki ph 1", area: "Lekki", neighborhood: "Phase 1" },
  { alias: "ikate", area: "Lekki", neighborhood: "Ikate" },
  { alias: "osapa", area: "Lekki", neighborhood: "Osapa" },
  { alias: "osapa london", area: "Lekki", neighborhood: "Osapa" },
  { alias: "chevron", area: "Lekki", neighborhood: "Chevron" },
  { alias: "agungi", area: "Lekki", neighborhood: "Agungi" },
  { alias: "jakande", area: "Lekki", neighborhood: "Jakande" },
  { alias: "ikota", area: "Lekki", neighborhood: "Ikota" },
  { alias: "admiralty", area: "Lekki", neighborhood: "Phase 1" },
  { alias: "banana island", area: "Ikoyi", neighborhood: "Banana Island" },
  { alias: "old ikoyi", area: "Ikoyi", neighborhood: "Old Ikoyi" },
  { alias: "parkview", area: "Ikoyi", neighborhood: "Parkview" },
  { alias: "victoria island", area: "Victoria Island" },
  { alias: "vi ", area: "Victoria Island" },
  { alias: " v.i", area: "Victoria Island" },
  { alias: "oniru", area: "Oniru" },
  { alias: "abraham adesanya", area: "Ajah", neighborhood: "Abraham Adesanya" },
  { alias: "sangotedo", area: "Sangotedo" },
  { alias: "ajah", area: "Ajah" },
  { alias: "ikeja gra", area: "Ikeja", neighborhood: "GRA" },
  { alias: "ikeja", area: "Ikeja" },
  { alias: "magodo phase 2", area: "Magodo", neighborhood: "Phase 2" },
  { alias: "magodo phase 1", area: "Magodo", neighborhood: "Phase 1" },
  { alias: "magodo", area: "Magodo" },
  { alias: "maryland", area: "Maryland" },
  { alias: "gbagada", area: "Gbagada" },
  { alias: "yaba", area: "Yaba" },
  { alias: "unilag", area: "Yaba", neighborhood: "UNILAG" },
  { alias: "surulere", area: "Surulere" },
  { alias: "ogudu", area: "Ogudu" },
  { alias: "ketu", area: "Ketu" },
  { alias: "lekki", area: "Lekki" },
  { alias: "ikoyi", area: "Ikoyi" },
];

const AMENITY_KEYWORDS: { keys: string[]; label: string }[] = [
  { keys: ["fitted kitchen", "fitted kitchen cabinets"], label: "Fitted kitchen" },
  { keys: ["pop", "p.o.p"], label: "POP ceiling" },
  { keys: ["24hrs light", "24 hrs light", "24 hours light", "24hr light", "stable light"], label: "24hrs light" },
  { keys: ["prepaid"], label: "Prepaid meter" },
  { keys: ["treated water", "borehole"], label: "Treated water" },
  { keys: ["inverter"], label: "Inverter" },
  { keys: ["solar"], label: "Solar" },
  { keys: ["generator", "estate gen", "gen house"], label: "Generator" },
  { keys: ["cctv"], label: "CCTV" },
  { keys: ["security"], label: "Security" },
  { keys: ["parking", "car park"], label: "Parking" },
  { keys: ["ensuite", "en-suite", "en suite"], label: "All rooms ensuite" },
  { keys: ["wardrobe"], label: "Wardrobes" },
  { keys: ["water heater", "geyser"], label: "Water heater" },
  { keys: ["air condition", "aircon", " a/c", " ac "], label: "Air conditioning" },
  { keys: ["swimming pool", "pool"], label: "Pool" },
  { keys: ["gym"], label: "Gym" },
  { keys: ["elevator", "lift"], label: "Lift" },
  { keys: ["bq", "boys quarter"], label: "BQ" },
  { keys: ["tarred"], label: "Tarred road" },
  { keys: ["newly built", "newly completed"], label: "Newly built" },
  { keys: ["newly renovated", "renovated"], label: "Renovated" },
  { keys: ["serviced"], label: "Serviced" },
  { keys: ["furnished"], label: "Furnished" },
  { keys: ["smart lock", "smart door"], label: "Smart lock" },
  { keys: ["balcony"], label: "Balcony" },
  { keys: ["water treatment"], label: "Treated water" },
];

function normalize(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/[₦]/g, "₦");
}

function parseMoneyToken(raw: string): number | null {
  const cleaned = raw.replace(/[, ]/g, "").toLowerCase();
  const million = cleaned.match(/^₦?(\d+(?:\.\d+)?)(m|million)$/);
  if (million) return Math.round(parseFloat(million[1]) * 1_000_000);
  const thousand = cleaned.match(/^₦?(\d+(?:\.\d+)?)(k|thousand)$/);
  if (thousand) return Math.round(parseFloat(thousand[1]) * 1_000);
  const naira = cleaned.match(/^₦(\d+(?:\.\d+)?)$/);
  if (naira) {
    const n = parseFloat(naira[1]);
    return n < 1000 ? Math.round(n * 1_000_000) : Math.round(n);
  }
  const plain = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) {
    const n = parseFloat(plain[1]);
    if (n >= 100 && n < 1000) return Math.round(n * 1000);
    if (n >= 50 && n < 100) return Math.round(n * 1_000_000);
    if (n < 50) return Math.round(n * 1_000_000);
    return Math.round(n);
  }
  return null;
}

function findMoneyAfter(label: RegExp, text: string): number | null {
  const lineMatch = text.match(label);
  if (!lineMatch || lineMatch.index === undefined) return null;
  const window = text.slice(lineMatch.index, lineMatch.index + 80);
  const token = window.match(/₦?\s*\d[\d,.]*\s*(?:million|thousand|m|k)?/i);
  if (!token) return null;
  return parseMoneyToken(token[0]);
}

function extractRent(text: string): number | null {
  const labeled = findMoneyAfter(
    /(?:\brent\b|\bprice\b|let\s*fee|\bannual\b|p\.\s*a\.?|\bper\s*annum\b|\byearly\b)\s*[:\-–]?\s*/i,
    text,
  );
  if (labeled) return labeled;
  const any = text.match(/₦\s*\d[\d,.]*\s*(?:million|m|k)?/i);
  if (any) return parseMoneyToken(any[0]);
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:million|m)\b/i);
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  return null;
}

function extractPercentFee(label: RegExp, text: string, rent: number | null): number | null {
  const slice = text.match(label);
  if (!slice || slice.index === undefined) return null;
  const window = text.slice(slice.index, slice.index + 60);
  const pct = window.match(/(\d{1,2})\s*%/);
  if (pct && rent) return Math.round((rent * parseInt(pct[1], 10)) / 100);
  const money = window.match(/₦?\s*\d[\d,.]*\s*(?:million|m|k)?/i);
  if (money) return parseMoneyToken(money[0]);
  return null;
}

function extractTypeAndBeds(text: string): { type: PropertyType; bedrooms: number } {
  const lower = ` ${text.toLowerCase()} `;
  if (/self[-\s]?contain|self contained|\bsc\b/.test(lower)) {
    return { type: "self-contain", bedrooms: 1 };
  }
  if (/room\s*(and|&)\s*parlour|r\s*&\s*p/.test(lower)) {
    return { type: "mini-flat", bedrooms: 1 };
  }
  if (/mini[-\s]?flat/.test(lower)) {
    return { type: "mini-flat", bedrooms: 1 };
  }
  if (/\bstudio\b/.test(lower)) {
    return { type: "studio", bedrooms: 0 };
  }

  let type: PropertyType = "flat";
  if (/\bpenthouse\b/.test(lower)) type = "penthouse";
  else if (/\bterrace\b/.test(lower)) type = "terrace";
  else if (/\bduplex\b/.test(lower)) type = "duplex";
  else if (/\bbungalow\b/.test(lower)) type = "bungalow";

  const bed = lower.match(/(\d+)\s*(?:bed(?:room)?s?|br\b)/);
  if (bed) return { type, bedrooms: parseInt(bed[1], 10) };
  if (type === "duplex") return { type, bedrooms: 4 };
  return { type, bedrooms: 2 };
}

function extractArea(text: string): { area: Area | ""; neighborhood: string } {
  const lower = text.toLowerCase();
  for (const row of AREA_ALIASES) {
    if (lower.includes(row.alias)) {
      return { area: row.area, neighborhood: row.neighborhood ?? "" };
    }
  }
  for (const area of AREAS) {
    if (lower.includes(area.toLowerCase())) return { area, neighborhood: "" };
  }
  return { area: "", neighborhood: "" };
}

function extractAmenities(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const row of AMENITY_KEYWORDS) {
    if (row.keys.some((k) => lower.includes(k))) {
      if (!found.includes(row.label)) found.push(row.label);
    }
  }
  return found;
}

function extractBaths(text: string, bedrooms: number, type: PropertyType): number {
  const m = text.toLowerCase().match(/(\d+)\s*bath/);
  if (m) return parseInt(m[1], 10);
  if (type === "self-contain" || type === "studio") return 1;
  if (/ensuite|en-suite/.test(text.toLowerCase())) return Math.max(bedrooms, 1);
  return Math.max(1, bedrooms - (bedrooms >= 3 ? 0 : 0));
}

function stripNoise(text: string): string {
  return text
    .replace(/[🔥✅✔️👉📌🏠🏡✨💯⭐️⭐]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const SAMPLE_POSTS: { label: string; body: string }[] = [
  {
    label: "Lekki 2 bed",
    body: `🔥 NEW LISTING 🔥

Newly built 2 bedroom apartment
Lekki Phase 1, by Admiralty

Rent: 4.5 million per annum
Service charge: 600k
Agency: 10%
Legal: 10%

Features:
- Fitted kitchen
- POP ceiling
- 24hrs light
- Treated water
- Parking space
- Security
- Prepaid meter
- All rooms ensuite

Available immediately
Inspection fee: 10k`,
  },
  {
    label: "Yaba self contain",
    body: `Self contain for rent
Yaba, close to UNILAG

Rent 850k yearly
Agency 10%
Legal 10%

Water and light
Wardrobe
Tiled floor
Prepaid meter

Suitable for a student or young professional.`,
  },
  {
    label: "Ajah duplex",
    body: `4 bedroom duplex with BQ
Abraham Adesanya, Ajah

Price: 6m per annum
Service charge 400k
Agency 10% Legal 10%

Newly built
Inverter
CCTV
Fitted kitchen
Parking
Tarred estate road
All rooms ensuite`,
  },
];

export function extractGroupName(text: string, knownNames: string[]): string | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  const forwarded = text.match(/forwarded from\s+([^\n]+)/i);
  if (forwarded) {
    const name = forwarded[1].replace(/^[*"']+|[*"']+$/g, "").trim();
    const match = matchKnownGroup(name, knownNames);
    if (match) return match;
    if (name.length >= 4 && name.length <= 80) return name;
  }

  for (const name of knownNames) {
    if (name && lower.includes(name.toLowerCase())) return name;
  }

  const first = lines[0]?.replace(/^[*"']+|[*"']+$/g, "").trim() ?? "";
  if (first && /group|homes|lets|available|housing|rent/i.test(first) && first.length <= 80) {
    return matchKnownGroup(first, knownNames) ?? first;
  }
  return null;
}

function matchKnownGroup(candidate: string, knownNames: string[]): string | null {
  const c = candidate.toLowerCase();
  for (const name of knownNames) {
    const n = name.toLowerCase();
    if (n === c || c.includes(n) || n.includes(c)) return name;
  }
  return null;
}

export function parseWhatsappPost(input: string): ParsedListing {
  const text = normalize(input);
  const { type, bedrooms } = extractTypeAndBeds(text);
  const { area, neighborhood } = extractArea(text);
  const rentAnnual = extractRent(text);
  const agencyFee = extractPercentFee(/agency/i, text, rentAnnual);
  const legalFee = extractPercentFee(/legal/i, text, rentAnnual);
  const serviceCharge =
    findMoneyAfter(/service\s*charge/i, text) ?? findMoneyAfter(/service\s*chr?g/i, text);
  const cautionFee = findMoneyAfter(/caution/i, text);
  const amenities = extractAmenities(text);
  const bathrooms = extractBaths(text, bedrooms, type);

  const kind =
    type === "self-contain"
      ? "Self contain"
      : type === "mini-flat"
        ? "Mini flat"
        : type === "studio"
          ? "Studio"
          : `${bedrooms} bedroom ${type}`;
  const place = neighborhood || area || "Lagos";
  const title = `${kind} in ${place}`;

  const description = stripNoise(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join("\n");

  let confidence = 0.2;
  if (rentAnnual) confidence += 0.3;
  if (area) confidence += 0.25;
  if (bedrooms || type === "self-contain" || type === "studio") confidence += 0.15;
  if (amenities.length >= 3) confidence += 0.1;
  confidence = Math.min(1, confidence);

  return {
    title,
    area,
    neighborhood,
    propertyType: type,
    bedrooms,
    bathrooms,
    rentAnnual,
    agencyFee,
    legalFee,
    serviceCharge,
    cautionFee,
    description: description || title,
    amenities,
    confidence,
  };
}
