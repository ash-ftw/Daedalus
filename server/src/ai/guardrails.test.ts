import assert from "node:assert/strict";
import test from "node:test";
import { enforceAiRateLimit, moderateImageDataUrl, moderateText } from "./guardrails";

test("enforces per-key AI rate limits", () => {
  const key = `rate-${crypto.randomUUID()}`;

  enforceAiRateLimit(key, 2);
  enforceAiRateLimit(key, 2);
  assert.throws(() => enforceAiRateLimit(key, 2), /rate limit/i);
});

test("rejects oversized image snapshots", () => {
  const original = process.env.AI_MAX_IMAGE_BYTES;
  process.env.AI_MAX_IMAGE_BYTES = "4";

  try {
    assert.throws(() => moderateImageDataUrl("data:image/png;base64,aaaaaaaaaaaa"), /too large/i);
  } finally {
    if (typeof original === "string") {
      process.env.AI_MAX_IMAGE_BYTES = original;
    } else {
      delete process.env.AI_MAX_IMAGE_BYTES;
    }
  }
});

test("allows text when no moderation terms are configured", () => {
  assert.doesNotThrow(() => moderateText("A plain diagram explanation."));
});
