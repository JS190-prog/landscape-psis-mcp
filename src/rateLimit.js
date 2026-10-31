import { config } from "./config.js";
import { extractQueryApiKey, hashSecret } from "./security.js";

const buckets = new Map();
let lastSweep = Date.now();

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function nowWindow() {
  return Math.floor(Date.now() / config.rateLimit.windowMs);
}

function incrementBucket(key, limit) {
  const window = nowWindow();
  const bucketKey = `${key}:${window}`;
  const current = buckets.get(bucketKey) || 0;
  buckets.set(bucketKey, current + 1);
  return { count: current + 1, limit };
}

function sweep() {
  const now = Date.now();
  if (now - lastSweep < config.rateLimit.windowMs) return;
  const minWindow = nowWindow() - 1;
  for (const key of buckets.keys()) {
    const parts = key.split(":");
    const window = Number(parts[parts.length - 1]);
    if (window < minWindow) buckets.delete(key);
  }
  lastSweep = now;
}

export function rateLimitMiddleware(req, res, next) {
  if (!config.rateLimit.enabled) return next();
  if (req.path === "/health" || req.path === "/.well-known/mcp-server.json") return next();
  sweep();

  const ipKey = `ip:${clientIp(req)}`;
  const ip = incrementBucket(ipKey, config.rateLimit.maxPerIp);
  if (ip.count > ip.limit) {
    return res.status(429).json({ error: true, code: "RATE_LIMIT_IP", message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
  }

  const apiKey = extractQueryApiKey(req);
  if (apiKey) {
    const keyBucket = `key:${hashSecret(apiKey).slice(0, 24)}`;
    const key = incrementBucket(keyBucket, config.rateLimit.maxPerKey);
    if (key.count > key.limit) {
      return res.status(429).json({ error: true, code: "RATE_LIMIT_API_KEY", message: "이 API 키의 요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
    }
  }

  next();
}
