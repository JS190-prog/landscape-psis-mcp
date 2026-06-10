import crypto from "crypto";

export function maskSecret(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 8) return "[REDACTED]";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

export function hashSecret(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function sanitizeUrlForLog(input) {
  try {
    const url = new URL(String(input), "http://localhost");
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.includes("apikey") || lower === "key" || lower.includes("token")) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    if (String(input).startsWith("/")) return `${url.pathname}${url.search}`;
    return url.toString();
  } catch {
    return "[UNPARSEABLE_URL]";
  }
}

export function stripQuery(input) {
  try {
    const url = new URL(String(input), "http://localhost");
    return url.pathname;
  } catch {
    return String(input).split("?")[0];
  }
}

export function extractQueryApiKey(req) {
  return req?.query?.psisApiKey || req?.query?.apiKey || req?.query?.key || "";
}
