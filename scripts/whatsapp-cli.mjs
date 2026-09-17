#!/usr/bin/env node
/**
 * Letlist Meta WhatsApp puller.
 * Talks to the running app (same database) — do not import PGLite here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.LETLIST_URL || "http://127.0.0.1:8080";
const DATA_DIR = join(process.cwd(), ".data");
const HEARTBEAT = join(DATA_DIR, "whatsapp-cli-heartbeat.json");
const INTERVAL_MS = Number(process.env.WHATSAPP_PULL_INTERVAL_MS || 45_000);

function beat(ok, note) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      HEARTBEAT,
      `${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), ok, note })}\n`,
    );
  } catch {
    /* ignore */
  }
}

async function hub(action, extra = {}) {
  const res = await fetch(`${BASE}/api/whatsapp/hub`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !json?.error) {
    throw new Error(`Hub answered ${res.status}`);
  }
  return json;
}

async function waitForApp() {
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/whatsapp/hub`, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* still booting */
    }
    beat(true, "Waiting for Letlist to come up.");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const command = process.argv[2] || "status";

if (command === "watch") {
  beat(true, "Puller starting.");
  await waitForApp();
  for (;;) {
    try {
      const result = await hub("tick");
      beat(Boolean(result.ok), result.note || result.error || "tick");
      if (process.env.WHATSAPP_CLI_LOG) {
        console.log(new Date().toISOString(), result.note || result.error || result.action);
      }
    } catch (err) {
      const note = err instanceof Error ? err.message : "tick failed";
      beat(false, note);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

try {
  if (command === "status") {
    const res = await fetch(`${BASE}/api/whatsapp/hub`);
    console.log(JSON.stringify(await res.json(), null, 2));
    process.exit(res.ok ? 0 : 1);
  }
  if (command === "connect") {
    const result = await hub("connect", {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: process.env.WHATSAPP_WABA_ID,
      appSecret: process.env.WHATSAPP_APP_SECRET,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (command === "pull") {
    const result = await hub("pull");
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  console.error("Usage: node scripts/whatsapp-cli.mjs <status|connect|pull|watch>");
  process.exit(1);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
