export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 16 * 1024 * 1024;
export const MEDIA_PER_LISTING = 12;

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/3gpp",
  "video/quicktime",
]);

export type MediaKind = "image" | "video";

export type CloudMediaRef = {
  waMediaId: string;
  mime: string;
  kind: MediaKind;
};

export type InlineMedia = {
  mime: string;
  kind: MediaKind;
  bytes: Uint8Array;
};

export type ListingMediaRef = {
  id: string;
  kind: MediaKind;
  mime: string;
};

export function kindFromMime(mime: string): MediaKind | null {
  const type = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (type === "image/jpg" || type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif") {
    return "image";
  }
  if (type === "video/mp4" || type === "video/3gpp" || type === "video/quicktime") return "video";
  return null;
}

export function normalizeMime(mime: string, kind: MediaKind): string {
  const type = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (type === "image/jpg") return "image/jpeg";
  if (ALLOWED.has(type)) return type;
  return kind === "video" ? "video/mp4" : "image/jpeg";
}
