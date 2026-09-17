import { createFileRoute } from "@tanstack/react-router";
import {
  IMAGE_MAX_BYTES,
  MEDIA_PER_LISTING,
  VIDEO_MAX_BYTES,
  kindFromMime,
  type InlineMedia,
} from "@/lib/whatsapp-media-kind";

export const Route = createFileRoute("/api/whatsapp/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getSql } = await import("@/lib/db");
        const { ensureListingsSchema } = await import("@/lib/listing-schema");
        await ensureListingsSchema();
        const sql = await getSql();
        const conn = await sql<{ connected: boolean }>`select connected from whatsapp_connection where id = ${"desk"}`;
        if (!conn[0]?.connected) {
          return Response.json({ error: "Connect WhatsApp first." }, { status: 400 });
        }

        let body = "";
        let groupName: string | undefined;
        const inline: InlineMedia[] = [];

        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("multipart/form-data")) {
          const form = await request.formData();
          body = String(form.get("body") ?? "");
          const group = String(form.get("groupName") ?? "").trim();
          if (group) groupName = group;
          for (const entry of form.getAll("media")) {
            if (typeof entry === "string") continue;
            const file = entry as File;
            const kind = kindFromMime(file.type);
            if (!kind) continue;
            const cap = kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
            if (file.size > cap) {
              return Response.json(
                { error: kind === "video" ? "Video is over 16MB." : "A photo is over 8MB." },
                { status: 400 },
              );
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            inline.push({ mime: file.type, kind, bytes });
          }
          if (inline.length > MEDIA_PER_LISTING) {
            return Response.json({ error: "Up to 12 photos/videos per listing." }, { status: 400 });
          }
        } else {
          try {
            const json = (await request.json()) as { body?: string; groupName?: string };
            body = json.body ?? "";
            groupName = json.groupName;
          } catch {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }
        }

        if (body.trim().length < 12 && inline.length === 0) {
          return Response.json({ error: "Paste the listing text or attach a photo." }, { status: 400 });
        }

        const { ingestWhatsappText } = await import("@/lib/whatsapp-ingest");
        try {
          const result = await ingestWhatsappText({
            body,
            groupName,
            from: "desk",
            inlineMedia: inline,
          });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not ingest that post.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
