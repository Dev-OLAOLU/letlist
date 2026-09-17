import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kindFromMime, normalizeMime } from "./whatsapp-media-kind.ts";

describe("kindFromMime", () => {
  it("accepts listing photos and videos", () => {
    assert.equal(kindFromMime("image/jpeg"), "image");
    assert.equal(kindFromMime("image/jpg; charset=binary"), "image");
    assert.equal(kindFromMime("video/mp4"), "video");
    assert.equal(kindFromMime("video/3gpp"), "video");
  });

  it("rejects documents WhatsApp cannot put on a card", () => {
    assert.equal(kindFromMime("application/pdf"), null);
    assert.equal(kindFromMime("image/svg+xml"), null);
    assert.equal(kindFromMime("audio/ogg"), null);
  });

  it("normalizes jpg", () => {
    assert.equal(normalizeMime("image/jpg", "image"), "image/jpeg");
  });
});
