import { normalizeNgPhone } from "@/lib/listings";
import { env } from "@/lib/env.server";
import { ingestWhatsappText, parseCloudApiPayload, type InboundWhatsapp, type IngestResult } from "@/lib/whatsapp-ingest";
import { resolvedWhatsappCreds } from "@/lib/whatsapp-secrets";

export const WHATSAPP_GRAPH_VERSION_DEFAULT = "v22.0";

export type MetaPhoneProfile = {
  id: string;
  displayPhone: string;
  displayPhoneDigits: string | null;
  verifiedName: string;
  quality: string;
  verification: string;
  platform: string;
  wabaId: string;
};

export type MetaPullReport = {
  ok: boolean;
  profile: MetaPhoneProfile | null;
  historyCount: number;
  groupCount: number;
  ingested: IngestResult[];
  note: string;
  error: string | null;
};

function graphVersion(): string {
  return env("WHATSAPP_GRAPH_VERSION") ?? WHATSAPP_GRAPH_VERSION_DEFAULT;
}

function redactSecrets(message: string): string {
  return message
    .replace(/EAA[A-Za-z0-9._-]+/g, "[token]")
    .replace(/Bearer\s+\S+/gi, "Bearer [token]");
}

function graphErrorMessage(json: unknown, status: number): string {
  if (json && typeof json === "object" && "error" in json) {
    const err = (json as { error?: { message?: string; error_user_msg?: string } }).error;
    const message = err?.error_user_msg || err?.message;
    if (typeof message === "string" && message.trim()) return redactSecrets(message.trim());
  }
  return `Meta returned ${status}.`;
}

async function graphGet(path: string, token: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) throw new Error(graphErrorMessage(json, res.status));
    if (json && typeof json === "object" && "error" in json) {
      throw new Error(graphErrorMessage(json, res.status));
    }
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Meta did not answer in time. Try Connect Meta again.");
    }
    if (err instanceof Error) throw err;
    throw new Error("Could not reach Meta from this machine.");
  } finally {
    clearTimeout(timer);
  }
}

async function graphGetOptional(path: string, token: string, params?: Record<string, string>): Promise<unknown> {
  try {
    return await graphGet(path, token, params);
  } catch {
    return null;
  }
}

export function extractInboundTexts(payload: unknown): {
  body: string;
  groupName?: string;
  waMessageId?: string;
  from?: string;
}[] {
  const out: { body: string; groupName?: string; waMessageId?: string; from?: string }[] = [];
  const seen = new Set<string>();

  const add = (body: unknown, groupName: unknown, id: unknown, from: unknown) => {
    if (typeof body !== "string") return;
    const text = body.trim();
    if (text.length < 12) return;
    if (/^https?:\/\//i.test(text) && text.length < 40) return;
    const key = typeof id === "string" && id ? id : text;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      body: text,
      groupName: typeof groupName === "string" && groupName.trim() ? groupName.trim() : undefined,
      waMessageId: typeof id === "string" && id ? id : undefined,
      from: typeof from === "string" && from.trim() ? from.trim() : undefined,
    });
  };

  const walk = (node: unknown, group: string | undefined) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, group);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const nextGroup =
      (typeof o.group_name === "string" && o.group_name) ||
      (typeof o.subject === "string" && o.subject) ||
      (typeof o.name === "string" && o.name && typeof o.participants !== "undefined" ? o.name : undefined) ||
      group;
    if (typeof o.body === "string") add(o.body, nextGroup, o.message_id ?? o.id, o.from);
    if (typeof o.message === "string") add(o.message, nextGroup, o.message_id ?? o.id, o.from);
    if (typeof o.caption === "string") add(o.caption, nextGroup, o.message_id ?? o.id, o.from);
    if (typeof o.text === "string") add(o.text, nextGroup, o.message_id ?? o.id, o.from);
    if (o.text && typeof o.text === "object") {
      const text = o.text as Record<string, unknown>;
      if (typeof text.body === "string") add(text.body, nextGroup, o.id, o.from);
    }
    for (const [key, value] of Object.entries(o)) {
      if (key === "error" || key === "paging") continue;
      if (value && typeof value === "object") walk(value, nextGroup);
    }
  };

  walk(payload, undefined);
  return out;
}

function mergeInbound(payloads: unknown[]): InboundWhatsapp[] {
  const seen = new Set<string>();
  const out: InboundWhatsapp[] = [];
  const add = (item: InboundWhatsapp) => {
    const key =
      item.waMessageId || `${item.body}::${(item.media ?? []).map((m) => m.waMediaId).join(",")}`;
    if (!key.trim() && !(item.media && item.media.length)) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const payload of payloads) {
    for (const item of parseCloudApiPayload(payload)) add(item);
    for (const item of extractInboundTexts(payload)) {
      add({
        body: item.body,
        groupName: item.groupName,
        waMessageId: item.waMessageId,
        from: item.from,
      });
    }
  }
  return out;
}

function metaMessageId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return id.startsWith("wamid.") ? id : `wamid.meta.${id}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parsePhoneProfile(json: unknown): MetaPhoneProfile {
  const row = asRecord(json);
  const waba = asRecord(row.whatsapp_business_account);
  const displayPhone = str(row.display_phone_number);
  return {
    id: str(row.id),
    displayPhone,
    displayPhoneDigits: normalizeNgPhone(displayPhone),
    verifiedName: str(row.verified_name),
    quality: str(row.quality_rating),
    verification: str(row.code_verification_status),
    platform: str(row.platform_type),
    wabaId: str(waba.id),
  };
}

export async function fetchPhoneProfile(): Promise<MetaPhoneProfile> {
  const creds = resolvedWhatsappCreds();
  if (!creds.accessToken || !creds.phoneNumberId) {
    throw new Error("Paste the Meta access token and Phone number ID, then Connect Meta.");
  }
  const json = await graphGet(`/${creds.phoneNumberId}`, creds.accessToken, {
    fields: [
      "id",
      "display_phone_number",
      "verified_name",
      "quality_rating",
      "code_verification_status",
      "platform_type",
    ].join(","),
  });
  const profile = parsePhoneProfile(json);
  if (!profile.id) throw new Error("Meta answered but this Phone number ID is not a WhatsApp Cloud line.");
  return profile;
}

function countData(payload: unknown): number {
  const row = asRecord(payload);
  if (Array.isArray(row.data)) return row.data.length;
  const nested = asRecord(row.message_history_with_events);
  if (Array.isArray(nested.data)) return nested.data.length;
  return 0;
}

export async function pullFromMeta(): Promise<MetaPullReport> {
  const creds = resolvedWhatsappCreds();
  if (!creds.accessToken || !creds.phoneNumberId) {
    return {
      ok: false,
      profile: null,
      historyCount: 0,
      groupCount: 0,
      ingested: [],
      note: "Meta keys are not on this machine yet.",
      error: "Paste the access token and Phone number ID from Meta → WhatsApp → API Setup.",
    };
  }

  let profile: MetaPhoneProfile;
  try {
    profile = await fetchPhoneProfile();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach Meta.";
    return {
      ok: false,
      profile: null,
      historyCount: 0,
      groupCount: 0,
      ingested: [],
      note: message,
      error: message,
    };
  }

  const token = creds.accessToken;
  const phoneId = creds.phoneNumberId;
  const wabaId = creds.wabaId || profile.wabaId;

  const [history, groups, wabaGroups, business] = await Promise.all([
    graphGetOptional(`/${phoneId}/message_history`, token),
    graphGetOptional(`/${phoneId}/groups`, token),
    wabaId ? graphGetOptional(`/${wabaId}/groups`, token) : Promise.resolve(null),
    graphGetOptional(`/${phoneId}/whatsapp_business_profile`, token, {
      fields: "about,address,description,email,profile_picture_url,websites,vertical",
    }),
  ]);

  const inbound = mergeInbound([history, groups, wabaGroups, business]);

  const ingested: IngestResult[] = [];
  for (const item of inbound) {
    ingested.push(
      await ingestWhatsappText({
        body: item.body,
        groupName: item.groupName,
        waMessageId: metaMessageId(item.waMessageId),
        from: item.from,
        media: item.media,
        inlineMedia: item.inlineMedia,
      }),
    );
  }

  const historyCount = countData(history);
  const groupCount = countData(groups) + countData(wabaGroups);
  const published = ingested.filter((i) => i.action === "published" || i.action === "updated").length;
  const mediaAttached = ingested.reduce((n, i) => n + (i.mediaCount ?? 0), 0);
  const mediaNote = mediaAttached
    ? ` · ${mediaAttached} photo${mediaAttached === 1 ? "" : "s"}/video${mediaAttached === 1 ? "" : "s"} saved`
    : "";
  const note =
    published > 0
      ? `Pulled ${published} listing${published === 1 ? "" : "s"} from the Meta inbox.${mediaNote}`
      : inbound.length > 0
        ? `Read ${inbound.length} message${inbound.length === 1 ? "" : "s"} from Meta; none parsed as a rent listing.${mediaNote}`
        : groupCount > 0
          ? `Meta line live. ${groupCount} Cloud API group${groupCount === 1 ? "" : "s"} on this number. Housing-group posts still need to be forwarded to this inbox — photos and videos come with the forward.`
          : historyCount > 0
            ? `Meta line live. Pulled ${historyCount} delivery event${historyCount === 1 ? "" : "s"}. Listing text and photos arrive when a post is forwarded to this number.`
            : "Meta line live. Cloud API does not expose housing-group history — forward listings (with their photos and videos) to this inbox, then pull again.";

  return {
    ok: true,
    profile,
    historyCount,
    groupCount,
    ingested,
    note,
    error: null,
  };
}
