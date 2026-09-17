import { createFileRoute } from "@tanstack/react-router";
import { handleWhatsappHub } from "@/lib/whatsapp-sync";

export const Route = createFileRoute("/api/whatsapp/hub")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await handleWhatsappHub({ action: "status" });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Hub status failed.";
          return Response.json({ ok: false, action: "status", error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        try {
          const result = await handleWhatsappHub(body);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Hub request failed.";
          return Response.json({ ok: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
