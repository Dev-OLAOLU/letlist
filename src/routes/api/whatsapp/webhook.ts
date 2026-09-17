import { createFileRoute } from "@tanstack/react-router";
import { whatsappRuntime } from "@/lib/whatsapp-config";
import { verifyWhatsappSignature } from "@/lib/whatsapp-signature";

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const { verifyToken } = whatsappRuntime();
        if (mode === "subscribe" && token === verifyToken && challenge) {
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const runtime = whatsappRuntime();
        const { resolvedWhatsappCreds } = await import("@/lib/whatsapp-secrets");
        const appSecret = runtime.appSecret || resolvedWhatsappCreds().appSecret;
        if (appSecret) {
          const header = request.headers.get("x-hub-signature-256");
          if (!verifyWhatsappSignature(raw, header, appSecret)) {
            return new Response("Forbidden", { status: 403 });
          }
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw) as unknown;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        try {
          const { ingestWhatsappText, parseCloudApiPayload } = await import("@/lib/whatsapp-ingest");
          const messages = parseCloudApiPayload(payload);
          const results = [];
          for (const message of messages) {
            results.push(await ingestWhatsappText(message));
          }
          return Response.json({ ok: true, count: results.length, results });
        } catch (err) {
          console.error("[whatsapp webhook]", err);
          // Meta retries non-2xx. Ack so a parse failure does not loop.
          return Response.json({ ok: false }, { status: 200 });
        }
      },
    },
  },
});
