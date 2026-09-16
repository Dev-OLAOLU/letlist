#!/usr/bin/env node
/**
 * Copy PGLite WASM + data files into the Vercel serverless function output.
 *
 * Nitro traces the JS module but often omits `pglite.data`. Without it, a
 * production deploy that has no DATABASE_URL crashes on every page with:
 *   ENOENT: open '/var/task/_libs/pglite.data'
 */
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

const destDirs = [
  join(root, ".vercel/output/functions/__server.func/_libs"),
  join(root, ".vercel/output/functions/__server.func"),
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(join(srcDir, "pglite.data")))) {
    console.warn("[pglite] @electric-sql/pglite dist files missing — skip copy");
    return;
  }

  let copied = 0;
  for (const dest of destDirs) {
    const parent = dirname(dest);
    if (!(await exists(parent))) continue;
    await mkdir(dest, { recursive: true });
    for (const file of files) {
      const from = join(srcDir, file);
      const to = join(dest, file);
      await copyFile(from, to);
      copied += 1;
      console.log(`[pglite] copied ${file} -> ${to}`);
    }
  }

  if (!copied) {
    console.log("[pglite] no Vercel function output yet — nothing to copy");
  }
}

main().catch((err) => {
  console.error("[pglite] asset copy failed:", err?.message || err);
  process.exit(1);
});
