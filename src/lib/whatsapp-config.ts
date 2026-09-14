import { env } from "@/lib/env.server";
import { DESK_WHATSAPP } from "@/lib/listings";

export const WHATSAPP_VERIFY_TOKEN_DEFAULT = "letlist-whatsapp";
export const WHATSAPP_WEBHOOK_PATH = "/api/whatsapp/webhook";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function publicBaseUrl(): string {
  const explicit = env("WHATSAPP_PUBLIC_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const production = env("VERCEL_PROJECT_PRODUCTION_URL");
  if (production) return `https://${production.replace(/^https?:\/\//, "")}`;
  const vercel = env("VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "";
}

export function whatsappRuntime() {
  const verifyToken = env("WHATSAPP_VERIFY_TOKEN") ?? WHATSAPP_VERIFY_TOKEN_DEFAULT;
  const appSecret = env("WHATSAPP_APP_SECRET");
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const inboxPhone = digits(env("WHATSAPP_INBOX_PHONE") ?? DESK_WHATSAPP);
  const publicUrl = publicBaseUrl();

  return {
    verifyToken,
    appSecret,
    accessToken,
    phoneNumberId,
    inboxPhone,
    publicUrl,
    webhookPath: WHATSAPP_WEBHOOK_PATH,
    webhookUrl: publicUrl ? `${publicUrl}${WHATSAPP_WEBHOOK_PATH}` : "",
    cloudConfigured: Boolean(accessToken && phoneNumberId),
    signatureRequired: Boolean(appSecret),
  };
}

export type WhatsappCloudStatus = {
  configured: boolean;
  signatureRequired: boolean;
  webhookPath: string;
  webhookUrl: string;
  verifyTokenDefault: string;
};
