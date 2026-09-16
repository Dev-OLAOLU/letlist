import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(join(root, "scripts/bundle-pglite-assets.mjs"), "utf8");

test("pglite asset copier targets Vercel _libs", () => {
  assert.match(script, /pglite\.data/);
  assert.match(script, /pglite\.wasm/);
  assert.match(script, /__server\.func\/_libs/);
});
