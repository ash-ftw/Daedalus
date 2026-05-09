const blockedTerms = (process.env.AI_BLOCKED_TERMS ?? "")
  .split(",")
  .map((term) => term.trim().toLowerCase())
  .filter(Boolean);

const requestLog = new Map<string, number[]>();

export function enforceAiRateLimit(key: string, limit = Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 20)) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (requestLog.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

  if (recent.length >= limit) {
    throw new Error("AI rate limit exceeded");
  }

  recent.push(now);
  requestLog.set(key, recent);
}

export function moderateText(value: string) {
  const lower = value.toLowerCase();
  const matched = blockedTerms.find((term) => lower.includes(term));

  if (matched) {
    throw new Error(`AI moderation blocked content containing configured term: ${matched}`);
  }
}

export function moderateImageDataUrl(imageDataUrl?: string) {
  if (!imageDataUrl) {
    return;
  }

  const maxBytes = Number(process.env.AI_MAX_IMAGE_BYTES ?? 7_500_000);
  const base64 = imageDataUrl.split(",")[1] ?? "";
  const approximateBytes = Math.floor((base64.length * 3) / 4);

  if (approximateBytes > maxBytes) {
    throw new Error("Canvas snapshot is too large for AI analysis");
  }
}
