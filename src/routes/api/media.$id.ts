import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id =
          params?.id ||
          new URL(request.url).pathname.split("/").filter(Boolean).pop() ||
          "";
        if (!id.startsWith("med-")) return new Response("Not found", { status: 404 });
        try {
          const { readListingMedia } = await import("@/lib/whatsapp-media");
          const media = await readListingMedia(id);
          if (!media) return new Response("Not found", { status: 404 });
          const body = Uint8Array.from(media.bytes);
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": media.mime,
              "Cache-Control": "public, max-age=86400, immutable",
              "Content-Length": String(media.bytes.byteLength),
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
