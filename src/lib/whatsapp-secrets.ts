import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/lib/env.server";

export const META_DATA_DIR = join(process.cwd(), ".data");
export const META_SECRETS_FILE = join(META_DATA_DIR, "meta-whatsapp.json");
export const META_HEARTBEAT_FILE = join(META_DATA_DIR, "whatsapp-cli-heartbeat.json");

export type MetaSecrets = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  savedAt: string;
};

export type MetaHeartbeat = {
  pid: number;
  at: string;
  ok: boolean;
  note: string;
};

export type ResolvedWhatsappCreds = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  source: "env" | "file" | "none";
};

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readMetaSecrets(): MetaSecrets | null {
  const parsed = readJsonFile<Partial<MetaSecrets>>(META_SECRETS_FILE);
  if (!parsed) return null;
  const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken.trim() : "";
  const phoneNumberId = typeof parsed.phoneNumberId === "string" ? parsed.phoneNumberId.replace(/\s/g, "") : "";
  if (!accessToken || !phoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId,
    wabaId: typeof parsed.wabaId === "string" ? parsed.wabaId.trim() : "",
    appSecret: typeof parsed.appSecret === "string" ? parsed.appSecret.trim() : "",
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
  };
}

export function writeMetaSecrets(partial: {
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
  appSecret?: string;
}): MetaSecrets {
  const prev = readJsonFile<Partial<MetaSecrets>>(META_SECRETS_FILE) ?? {};
  const accessToken = (partial.accessToken ?? prev.accessToken ?? "").trim();
  const phoneNumberId = (partial.phoneNumberId ?? prev.phoneNumberId ?? "").replace(/\s/g, "");
  if (!accessToken || !phoneNumberId) {
    throw new Error("Access token and Phone number ID are both required.");
  }
  const next: MetaSecrets = {
    accessToken,
    phoneNumberId,
    wabaId: (partial.wabaId !== undefined ? partial.wabaId : (prev.wabaId ?? "")).trim(),
    appSecret: (partial.appSecret !== undefined ? partial.appSecret : (prev.appSecret ?? "")).trim(),
    savedAt: new Date().toISOString(),
  };
  try {
    mkdirSync(META_DATA_DIR, { recursive: true });
    writeFileSync(META_SECRETS_FILE, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    throw new Error("Could not store Meta keys on this host. Add them as environment variables instead.");
  }
  return next;
}

export function resolvedWhatsappCreds(): ResolvedWhatsappCreds {
  const file = readMetaSecrets();
  const accessToken = env("WHATSAPP_ACCESS_TOKEN") ?? file?.accessToken ?? "";
  const phoneNumberId = (env("WHATSAPP_PHONE_NUMBER_ID") ?? file?.phoneNumberId ?? "").replace(/\s/g, "");
  const wabaId = env("WHATSAPP_WABA_ID") ?? file?.wabaId ?? "";
  const appSecret = env("WHATSAPP_APP_SECRET") ?? file?.appSecret ?? "";
  const source: ResolvedWhatsappCreds["source"] = env("WHATSAPP_ACCESS_TOKEN")
    ? "env"
    : file
      ? "file"
      : "none";
  return { accessToken, phoneNumberId, wabaId, appSecret, source };
}

export function tokenTail(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length < 8) return "";
  return trimmed.slice(-4);
}

export function readHeartbeat(): MetaHeartbeat | null {
  const beat = readJsonFile<MetaHeartbeat>(META_HEARTBEAT_FILE);
  if (!beat || typeof beat.at !== "string") return null;
  return beat;
}

export function isPullerRunning(beat: MetaHeartbeat | null = readHeartbeat()): boolean {
  if (!beat) return false;
  const at = Date.parse(beat.at);
  if (Number.isNaN(at)) return false;
  return Date.now() - at < 90_000;
}

export function writeHeartbeat(beat: MetaHeartbeat): void {
  try {
    mkdirSync(META_DATA_DIR, { recursive: true });
    writeFileSync(META_HEARTBEAT_FILE, `${JSON.stringify(beat)}\n`, { encoding: "utf8" });
  } catch {
    /* preview/serverless hosts may be read-only */
  }
}
