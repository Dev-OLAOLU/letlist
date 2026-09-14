import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header) return false;
  const hex = header.startsWith("sha256=") ? header.slice(7) : header;
  if (!/^[0-9a-f]+$/i.test(hex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(hex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
